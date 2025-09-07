const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const Bill = require('../models/Bill');
const PDFDocument = require('pdfkit');

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login');
}

async function generateUniqueBillNumber() {
  let billNumber;
  let exists = true;

  while (exists) {
    billNumber = Math.floor(100000000 + Math.random() * 900000000);
    exists = await Bill.exists({ billNumber });
  }

  return billNumber;
}

router.get('/make-bill', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id).select('-password').lean();
    const medicines = await Medicine.find({ username: user.username }).lean();

    const noMedicines = medicines.length === 0;

    res.render('make-bill', { user, medicines, noMedicines });
  } catch (err) {
    console.error('Error loading Make Bill page:', err);
    res.redirect('/dashboard');
  }
});

router.get('/billing-history', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id).select('-password').lean();
    const bills = await Bill.find({ username: user.username }).sort({ createdAt: -1 }).lean();
    res.render('billing-history', { user, bills });
  } catch (err) {
    console.error('Error loading billing history:', err);
    res.redirect('/dashboard');
  }
});

router.post('/make-bill', isAuthenticated, async (req, res) => {
  try {
    const { customerName, mobileNumber, medicines } = req.body;
    const user = await User.findById(req.session.user._id).select('-password').lean();

    if (!customerName || !mobileNumber || !Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).json({ error: 'Incomplete bill data' });
    }

    let totalAmount = 0;
    const billItems = [];

    for (const item of medicines) {
      const med = await Medicine.findById(item.medicineId);
      const requestedQty = parseInt(item.quantity);

      if (!med) {
        return res.status(404).json({ error: 'Medicine not found' });
      }

      if (med.quantity < requestedQty) {
        return res.status(400).json({ error: `Insufficient stock for ${med.name}` });
      }

      med.quantity -= requestedQty;
      await med.save();

      billItems.push({
        medicineId: med._id,
        name: med.name,
        quantity: requestedQty,
        price: med.price
      });

      totalAmount += med.price * requestedQty;
    }

    const billNumber = await generateUniqueBillNumber();

    const newBill = new Bill({
      username: user.username,
      customerName,
      mobileNumber,
      medicines: billItems,
      totalAmount,
      billNumber
    });

    await newBill.save();

    res.redirect(`/make-bill?bill=success&number=${billNumber}`);
  } catch (err) {
    console.error('Error creating bill:', err);
    res.status(500).json({ error: 'Server error while creating bill' });
  }
});

router.get('/api/bill/:id', isAuthenticated, async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id).lean();
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    res.json(bill);
  } catch (err) {
    console.error('Error fetching bill:', err);
    res.status(500).json({ error: 'Server error while fetching bill' });
  }
});

router.get('/download-bill/:id', isAuthenticated, async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id).lean();
    if (!bill) return res.status(404).send('Bill not found');

    const user = await User.findOne({ username: bill.username }).lean();
    if (!user) return res.status(404).send('User not found');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=bill-${bill.billNumber}.pdf`);

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    const rupee = 'Rs. ';
    const startX = 50;
    const tableWidth = 500;
    const rowHeight = 25;

    const colWidths = {
      medicine: 250,
      quantity: 100,
      amount: 150,
    };

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 25;

    doc.rect(margin, margin, pageWidth - 2 * margin, pageHeight - 2 * margin).stroke();

    doc.font('Helvetica-Bold').fillColor('#007bff').fontSize(20).text(user.shopName || 'MED PHARMACY', { align: 'center' });
    doc.font('Helvetica').fillColor('black').fontSize(10)
      .text(user.address || 'Address not available', { align: 'center' })
      .text(`Mobile :- ${user.mobile || 'N/A'}, Email :- ${user.email || 'N/A'}`, { align: 'center' });

    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(16).text(`Bill #${bill.billNumber}`, startX);
    doc.font('Helvetica').fontSize(14)
      .text(`Name :- ${bill.customerName}`, startX)
      .text(`Mobile :- ${bill.mobileNumber}`, startX)
      .text(`Date & Time :- ${new Date(bill.createdAt).toLocaleString('en-IN', {
        day: 'numeric', month: 'numeric', year: 'numeric',
        hour: 'numeric', minute: 'numeric', hour12: true
      }).toUpperCase()}`, startX);

    doc.moveDown();

    const startY = doc.y;
    const headers = ['Medicine', 'Quantity', 'Amount'];

    doc.rect(startX, startY, tableWidth, rowHeight).fill('#f0f0f0').stroke();

    doc.fillColor('black').font('Helvetica-Bold').fontSize(12);
    doc.text(headers[0], startX + 5, startY + 7, { width: colWidths.medicine - 10 });
    doc.text(headers[1], startX + colWidths.medicine + 5, startY + 7);
    doc.text(headers[2], startX + colWidths.medicine + colWidths.quantity + 5, startY + 7);

    doc.moveTo(startX, startY).lineTo(startX + tableWidth, startY).stroke();
    doc.moveTo(startX, startY + rowHeight).lineTo(startX + tableWidth, startY + rowHeight).stroke();
    doc.moveTo(startX, startY).lineTo(startX, startY + rowHeight).stroke();
    doc.moveTo(startX + colWidths.medicine, startY).lineTo(startX + colWidths.medicine, startY + rowHeight).stroke();
    doc.moveTo(startX + colWidths.medicine + colWidths.quantity, startY).lineTo(startX + colWidths.medicine + colWidths.quantity, startY + rowHeight).stroke();
    doc.moveTo(startX + tableWidth, startY).lineTo(startX + tableWidth, startY + rowHeight).stroke();

    doc.font('Helvetica').fontSize(11);
    let y = startY + rowHeight;

    bill.medicines.forEach(med => {
      const amount = med.quantity * med.price;

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
    doc.font('Helvetica-Bold').fontSize(14)
      .text(`Total = ${rupee}${bill.totalAmount.toFixed(2)}`, startX, y + 20, {
        width: tableWidth,
        align: 'right'
      });

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).send('Error generating PDF');
  }
});

module.exports = router;
