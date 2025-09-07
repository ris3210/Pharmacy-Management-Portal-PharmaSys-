const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const Order = require('../models/Order');

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login');
}

router.get('/view-transactions', isAuthenticated, async (req, res) => {
  try {
    const username = req.session.user.username;

    const bills = await Bill.find({ username }).lean();
    const orders = await Order.find({ username }).lean();

    const groupedTransactions = {};

    bills.forEach(bill => {
      const dateKey = new Date(bill.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      if (!groupedTransactions[dateKey]) groupedTransactions[dateKey] = [];

      groupedTransactions[dateKey].push({
        type: 'Bill',
        label: `Bill #${bill.billNumber}`,
        name: bill.customerName,
        amount: bill.totalAmount,
        time: bill.createdAt
      });
    });

    orders.forEach(order => {
      const dateKey = new Date(order.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      if (!groupedTransactions[dateKey]) groupedTransactions[dateKey] = [];

      const orderedItems = Array.isArray(order.orderedItems)
        ? order.orderedItems
        : Array.isArray(order.items)
        ? order.items
        : [];

      const orderedTotal = orderedItems.reduce((sum, med) => {
        return sum + (med.price || 0) * (med.quantity || 0);
      }, 0);

      if (orderedTotal > 0) {
        groupedTransactions[dateKey].push({
          type: 'Order',
          label: `Order #${order.orderId}`,
          name: order.supplierName,
          amount: orderedTotal,
          time: order.createdAt
        });
      }

      if (order.status === 'Cancelled' && order.refundReceived) {
        const cancelledItems = [
          ...(order.partialCancelled || []),
          ...(order.cancelledRest || [])
        ].filter(item => typeof item.price === 'number' && typeof item.quantity === 'number');

        const refundTotal = cancelledItems.reduce((sum, med) => {
          return sum + med.price * med.quantity;
        }, 0);

        let refundType = 'Refund';
        if (order.partialCancelled?.length > 0 && order.cancelledRest?.length > 0) {
          refundType = 'Full Refund';
        } else if (order.partialCancelled?.length > 0) {
          refundType = 'Partial Refund';
        }

        groupedTransactions[dateKey].push({
          type: 'Refund',
          label: `Refund against Order #${order.orderId}`,
          name: refundType,
          amount: refundTotal,
          time: order.createdAt
        });
      }
    });

    res.render('view-transactions', {
      username,
      groupedTransactions
    });
  } catch (err) {
    console.error('Error loading transactions:', err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
