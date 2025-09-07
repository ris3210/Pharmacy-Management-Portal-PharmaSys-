const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');
const Order = require('../models/Order');
const User = require('../models/User');
const PDFDocument = require('pdfkit');

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login');
}

function generateOrderId() {
  const base = Date.now().toString().slice(-6);
  const random = Math.floor(100 + Math.random() * 900);
  return base + random;
}

router.get('/place-order', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id).select('-password').lean();
    const medicines = await Medicine.find({ username: user.username }).lean();
    const noMedicines = medicines.length === 0;
    res.render('place-order', { user, medicines, noMedicines });
  } catch (err) {
    console.error('Error loading Place Order page:', err);
    res.redirect('/dashboard');
  }
});

router.post('/place-order', isAuthenticated, async (req, res) => {
  try {
    const { supplierName, medicines } = req.body;
    const user = await User.findById(req.session.user._id).select('-password').lean();

    if (!supplierName || !Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).send('Incomplete order data');
    }

    const orderItems = [];

    for (const item of medicines) {
      const med = await Medicine.findById(item.medicineId).lean();
      const requestedQty = parseInt(item.quantity);

      if (!med) return res.status(404).send(`Medicine not found`);
      if (requestedQty < 1) return res.status(400).send(`Invalid quantity for ${med.name}`);

      orderItems.push({
        medicineId: med._id,
        name: med.name,
        quantity: requestedQty,
        price: med.price
      });
    }

    const orderId = generateOrderId();

    const newOrder = new Order({
      orderId,
      username: user.username,
      supplierName,
      medicines: orderItems,
      status: 'Pending'
    });

    await newOrder.save();
    res.status(200).send(`Order #${orderId} placed successfully!`);
  } catch (err) {
    console.error('Error placing order:', err);
    res.status(500).send('Server error while placing order');
  }
});

router.get('/orders', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id).select('-password').lean();
    const orders = await Order.find({ username: user.username }).sort({ createdAt: -1 }).lean();
    res.render('orders', { user, orders });
  } catch (err) {
    console.error('Error loading orders:', err);
    res.redirect('/dashboard');
  }
});

router.get('/accept-order', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.session.user._id).select('-password').lean();
  const orders = await Order.find({
    username: user.username,
    $or: [
      { status: { $in: ['Pending', 'Partially Accepted', 'Partially Cancelled'] } },
      { 
        status: { $in: ['Cancelled', 'Completed'] },
        $or: [
          { partialRefundReceived: { $ne: true } },
          { fullRefundReceived: { $ne: true } }
        ]
      }
    ]
  }).sort({ createdAt: -1 }).lean();
  res.render('accept-order', { user, orders });
});

router.post('/order/:id/accept', isAuthenticated, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Order not found');

    for (const item of order.medicines) {
      await Medicine.updateOne(
        { _id: item.medicineId },
        { $inc: { quantity: item.quantity } }
      );
    }

    order.status = 'Accepted';
    order.updatedAt = new Date();
    await order.save();

    res.status(200).send('Order accepted and stock updated');
  } catch (err) {
    console.error('Error accepting order:', err);
    res.status(500).send('Server error');
  }
});

router.get('/order-history', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id).select('-password').lean();
    const orders = await Order.find({ username: user.username }).sort({ createdAt: -1 }).lean();
    res.render('order-history', { user, orders });
  } catch (err) {
    console.error('Error loading order history:', err);
    res.redirect('/dashboard');
  }
});

router.post('/order/:id/cancel', isAuthenticated, async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { status: 'Cancelled' });
    res.status(200).send('Order cancelled');
  } catch (err) {
    console.error('Error cancelling order:', err);
    res.status(500).send('Server error');
  }
});

router.post('/order/:id/refund', isAuthenticated, async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { refundReceived: true });
    res.status(200).send('Refund received, processed & updated successfully!!');
  } catch (err) {
    console.error('Error marking refund:', err);
    res.status(500).send('Server error');
  }
});

router.get('/api/order/:id', isAuthenticated, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).send('Order not found');
    res.json(order);
  } catch (err) {
    console.error('Error fetching order details:', err);
    res.status(500).send('Server error');
  }
});

router.post('/order/:id/partial-accept', isAuthenticated, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Order not found');

    const updates = req.body;
    const acceptedItems = [];

    for (const med of order.medicines) {
      const medId = med.medicineId.toString();
      const requestedQty = parseInt(updates[medId]);

      if (!requestedQty || requestedQty <= 0) continue;

      const alreadyAccepted = order.partialAccepted
        .filter(item => item.medicineId.toString() === medId)
        .reduce((sum, item) => sum + item.quantity, 0);

      const alreadyCancelled = order.partialCancelled
        .filter(item => item.medicineId.toString() === medId)
        .reduce((sum, item) => sum + item.quantity, 0);

      const remainingQty = med.quantity - alreadyAccepted - alreadyCancelled;

      if (requestedQty <= remainingQty) {
        acceptedItems.push({
          medicineId: med.medicineId,
          name: med.name,
          quantity: requestedQty,
          price: med.price
        });

        await Medicine.updateOne(
          { _id: med.medicineId },
          { $inc: { quantity: requestedQty } }
        );
      }
    }

    if (acceptedItems.length === 0) {
      return res.status(400).send('No valid medicines selected for partial acceptance');
    }

    order.partialAccepted.push(...acceptedItems);
    order.status = 'Partially Accepted';
    order.updatedAt = new Date();
    await order.save();

    res.status(200).send('Partial acceptance recorded and stock updated');
  } catch (err) {
    console.error('Error processing partial accept:', err);
    res.status(500).send('Server error');
  }
});

router.post('/order/:id/partial-cancel', isAuthenticated, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Order not found');

    const updates = req.body;
    const cancelledItems = [];

    for (const med of order.medicines) {
      const medId = med.medicineId.toString();
      const requestedQty = parseInt(updates[medId]);

      if (!requestedQty || requestedQty <= 0) continue;

      const alreadyAccepted = order.partialAccepted
        .filter(item => item.medicineId.toString() === medId)
        .reduce((sum, item) => sum + item.quantity, 0);

      const alreadyCancelled = order.partialCancelled
        .filter(item => item.medicineId.toString() === medId)
        .reduce((sum, item) => sum + item.quantity, 0);

      const remainingQty = med.quantity - alreadyAccepted - alreadyCancelled;

      if (requestedQty <= remainingQty) {
        cancelledItems.push({
          medicineId: med.medicineId,
          name: med.name,
          quantity: requestedQty,
          price: med.price
        });
      }
    }

    if (cancelledItems.length === 0) {
      return res.status(400).send('No valid medicines selected for partial cancellation');
    }

    order.partialCancelled.push(...cancelledItems);

    const hasAccepted = order.partialAccepted && order.partialAccepted.length > 0;

    order.status = hasAccepted ? 'Partially Accepted' : 'Partially Cancelled';
    order.updatedAt = new Date();
    await order.save();

    res.status(200).send('Partial cancellation recorded successfully');
  } catch (err) {
    console.error('Error processing partial cancel:', err);
    res.status(500).send('Server error');
  }
});

router.post('/order/:id/accept-rest', isAuthenticated, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Order not found');

    const acceptedItems = [];

    for (const med of order.medicines) {
      const medId = med.medicineId.toString();

      const alreadyAccepted = order.partialAccepted
        .filter(item => item.medicineId.toString() === medId)
        .reduce((sum, item) => sum + item.quantity, 0);

      const alreadyCancelled = order.partialCancelled
        .filter(item => item.medicineId.toString() === medId)
        .reduce((sum, item) => sum + item.quantity, 0);

      const alreadyAcceptedRest = (order.acceptedRest || [])
        .filter(item => item.medicineId.toString() === medId)
        .reduce((sum, item) => sum + item.quantity, 0);

      const remainingQty = med.quantity - alreadyAccepted - alreadyCancelled - alreadyAcceptedRest;

      if (remainingQty > 0) {
        acceptedItems.push({
          medicineId: med.medicineId,
          name: med.name,
          quantity: remainingQty,
          price: med.price
        });

        await Medicine.updateOne(
          { _id: med.medicineId },
          { $inc: { quantity: remainingQty } }
        );
      }
    }

    order.acceptedRest = order.acceptedRest || [];
    order.acceptedRest.push(...acceptedItems);

    const totalAccepted = [...order.partialAccepted, ...(order.acceptedRest || [])]
      .reduce((sum, item) => sum + item.quantity, 0);
    const totalCancelled = order.partialCancelled.reduce((sum, item) => sum + item.quantity, 0);
    const totalOrdered = order.medicines.reduce((sum, item) => sum + item.quantity, 0);

    if (totalAccepted + totalCancelled === totalOrdered) {
      order.status = totalAccepted > 0 && totalCancelled > 0 ? 'Completed' :
                     totalAccepted === totalOrdered ? 'Accepted' :
                     'Cancelled';
    } else {
      order.status = 'Partially Accepted';
    }

    order.updatedAt = new Date();
    await order.save();

    res.status(200).send('Remaining items accepted successfully');
  } catch (err) {
    console.error('Error accepting rest:', err);
    res.status(500).send('Server error');
  }
});

router.post('/order/:id/cancel-rest', isAuthenticated, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Order not found');

    const cancelledItems = [];

    for (const med of order.medicines) {
      const medId = med.medicineId.toString();

      const alreadyAccepted = order.partialAccepted
        .filter(item => item.medicineId.toString() === medId)
        .reduce((sum, item) => sum + item.quantity, 0);

      const alreadyCancelled = order.partialCancelled
        .filter(item => item.medicineId.toString() === medId)
        .reduce((sum, item) => sum + item.quantity, 0);

      const alreadyCancelledRest = (order.cancelledRest || [])
        .filter(item => item.medicineId.toString() === medId)
        .reduce((sum, item) => sum + item.quantity, 0);

      const remainingQty = med.quantity - alreadyAccepted - alreadyCancelled - alreadyCancelledRest;

      if (remainingQty > 0) {
        cancelledItems.push({
          medicineId: med.medicineId,
          name: med.name,
          quantity: remainingQty,
          price: med.price
        });
      }
    }

    order.cancelledRest = order.cancelledRest || [];
    order.cancelledRest.push(...cancelledItems);

    const totalAccepted = [...order.partialAccepted, ...(order.acceptedRest || [])]
      .reduce((sum, item) => sum + item.quantity, 0);
    const totalCancelled = [...order.partialCancelled, ...(order.cancelledRest || [])]
      .reduce((sum, item) => sum + item.quantity, 0);
    const totalOrdered = order.medicines.reduce((sum, item) => sum + item.quantity, 0);

    if (totalAccepted + totalCancelled === totalOrdered) {
      order.status = totalAccepted > 0 && totalCancelled > 0 ? 'Completed' :
                     totalCancelled === totalOrdered ? 'Cancelled' :
                     'Accepted';
    } else {
      order.status = 'Partially Cancelled';
    }

    order.updatedAt = new Date();
    await order.save();

    res.status(200).send('Remaining items cancelled successfully');
  } catch (err) {
    console.error('Error cancelling rest:', err);
    res.status(500).send('Server error');
  }
});

router.post('/receive-partial-refund/:id', async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { partialRefundReceived: true });
    res.status(200).send('Partial Refund received');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error receiving partial refund');
  }
});

router.post('/receive-full-refund/:id', async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { fullRefundReceived: true });
    res.status(200).send('Full Refund received');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error receiving full refund');
  }
});

router.post('/receive-remaining-partial-refund/:id', async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { fullRefundReceived: true });
    res.status(200).send('Remaining Partial Refund received');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error receiving remaining partial refund');
  }
});

router.get('/download-order/:id', isAuthenticated, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).send('Order not found');

    const user = await User.findOne({ username: order.username }).lean();
    if (!user) return res.status(404).send('User not found');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=order-${order.orderId}.pdf`);

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    const rupee = 'Rs. ';
    const startX = 50;
    const tableWidth = 500;
    const rowHeight = 25;
    const colWidths = { medicine: 250, quantity: 100, amount: 150 };
    const margin = 25;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    doc.rect(margin, margin, pageWidth - 2 * margin, pageHeight - 2 * margin).stroke();

    doc.font('Helvetica-Bold').fillColor('#007bff').fontSize(20).text(user.shopName || 'MED PHARMACY', { align: 'center' });
    doc.font('Helvetica').fillColor('black').fontSize(10)
      .text(user.address || 'Address not available', { align: 'center' })
      .text(`Mobile :- ${user.mobile || 'N/A'}, Email :- ${user.email || 'N/A'}`, { align: 'center' });

    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(16).text(`Order #${order.orderId}`, startX);
    doc.font('Helvetica').fontSize(14)
      .text(`Supplier :- ${order.supplierName}`, startX)
      .text(`Status :- ${order.status}`, startX)
      .text(`Date & Time :- ${new Date(order.createdAt).toLocaleString('en-IN', {
        day: 'numeric', month: 'numeric', year: 'numeric',
        hour: 'numeric', minute: 'numeric', hour12: true
      }).toUpperCase()}`, startX);

    if (order.status === 'Cancelled') {
      doc.text(`Refund Received :- ${order.refundReceived ? 'Yes' : 'No'}`, startX);
    }

    doc.moveDown();

    const renderTable = (items, title, qtyLabel) => {
      if (!items || items.length === 0) return;

      doc.font('Helvetica-Bold').fontSize(14).text(title, startX);
      const startY = doc.y;

      doc.rect(startX, startY, tableWidth, rowHeight).fill('#f0f0f0').stroke();
      doc.fillColor('black').font('Helvetica-Bold').fontSize(12);
      doc.text('Medicine', startX + 5, startY + 7, { width: colWidths.medicine - 10 });
      doc.text(qtyLabel, startX + colWidths.medicine + 5, startY + 7);
      doc.text('Amount', startX + colWidths.medicine + colWidths.quantity + 5, startY + 7);

      doc.moveTo(startX, startY).lineTo(startX + tableWidth, startY).stroke();
      doc.moveTo(startX, startY + rowHeight).lineTo(startX + tableWidth, startY + rowHeight).stroke();
      doc.moveTo(startX, startY).lineTo(startX, startY + rowHeight).stroke();
      doc.moveTo(startX + colWidths.medicine, startY).lineTo(startX + colWidths.medicine, startY + rowHeight).stroke();
      doc.moveTo(startX + colWidths.medicine + colWidths.quantity, startY).lineTo(startX + colWidths.medicine + colWidths.quantity, startY + rowHeight).stroke();
      doc.moveTo(startX + tableWidth, startY).lineTo(startX + tableWidth, startY + rowHeight).stroke();

      doc.font('Helvetica').fontSize(11);
      let y = startY + rowHeight;
      let total = 0;

      items.forEach(med => {
        const amount = med.quantity * med.price;
        total += amount;

        doc.fillColor('black');
        doc.text(med.name, startX + 5, y + 7, { width: colWidths.medicine - 10, ellipsis: true });
        doc.text(med.quantity.toString(), startX + colWidths.medicine + 5, y + 7);
        doc.text(`${rupee}${amount.toFixed(2)}`, startX + colWidths.medicine + colWidths.quantity + 5, y + 7);

        doc.moveTo(startX, y).lineTo(startX + tableWidth, y).stroke();
        doc.moveTo(startX, y + rowHeight).lineTo(startX + tableWidth, y + rowHeight).stroke();
        doc.moveTo(startX, y).lineTo(startX, y + rowHeight).stroke();
        doc.moveTo(startX + colWidths.medicine, y).lineTo(startX + colWidths.medicine, y + rowHeight).stroke();
        doc.moveTo(startX + colWidths.medicine + colWidths.quantity, y).lineTo(startX + colWidths.medicine + colWidths.quantity, y + rowHeight).stroke();
        doc.moveTo(startX + tableWidth, y).lineTo(startX + tableWidth, y + rowHeight).stroke();

        y += rowHeight;
      });

      doc.moveDown();
      doc.font('Helvetica-Bold').fontSize(13)
        .text(`Total = ${rupee}${total.toFixed(2)}`, startX, y + 10, {
          width: tableWidth,
          align: 'right'
        });

      doc.moveDown();
    };

    renderTable(order.medicines, 'Ordered Medicines', 'Quantity');
    renderTable(order.partialAccepted, 'Partially Accepted Medicines', 'Accepted Qty');
    renderTable(order.acceptedRest, 'Accepted Rest', 'Quantity');
    renderTable(order.partialCancelled, 'Partially Cancelled Medicines', 'Cancelled Qty');
    renderTable(order.cancelledRest, 'Cancelled Rest', 'Quantity');

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).send('Error generating PDF');
  }
});

module.exports = router;
