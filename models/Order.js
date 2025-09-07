const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  medicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  }
});

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  username: {
    type: String,
    required: true
  },
  supplierName: {
    type: String,
    required: true,
    trim: true
  },
  medicines: [orderItemSchema],

  partialAccepted: [orderItemSchema],
  acceptedRest: [orderItemSchema],

  partialCancelled: [orderItemSchema],
  cancelledRest: [orderItemSchema],

  status: {
    type: String,
    enum: ['Pending', 'Partially Accepted', 'Accepted', 'Cancelled', 'Partially Cancelled', 'Completed'],
    default: 'Pending'
  },

  refundReceived: {
    type: Boolean,
    default: false
  },
  partialRefundReceived: {
    type: Boolean,
    default: false
  },
  fullRefundReceived: {
    type: Boolean,
    default: false
  },

  notes: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date
  }
});

orderSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Order', orderSchema);
