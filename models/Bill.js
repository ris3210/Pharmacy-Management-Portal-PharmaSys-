const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  billNumber: {
  type: Number,
  unique: true,
  required: true
  },
  username: {
    type: String,
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  mobileNumber: {
    type: String,
    required: true,
    match: /^[6-9]\d{9}$/
  },
  medicines: [
    {
      medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
      name: String,
      quantity: Number,
      price: Number
    }
  ],
  totalAmount: {
    type: Number,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Bill', billSchema);
