const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login');
}

router.get('/manage-medicine', isAuthenticated, (req, res) => {
  res.render('manage-medicine');
});

router.post('/add-medicine', isAuthenticated, async (req, res) => {
  try {
    const { name, quantity, price } = req.body;
    const user = req.session.user;

    const newMedicine = new Medicine({
      username: user.username,
      name,
      quantity,
      price
    });

    await newMedicine.save();
    res.status(200).send('Medicine saved successfully');
  } catch (err) {
    console.error('Error saving medicine:', err);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/medicines', isAuthenticated, async (req, res) => {
  try {
    const user = req.session.user;
    const medicines = await Medicine.find({ username: user.username });
    res.json(medicines);
  } catch (err) {
    console.error('Error fetching medicines:', err);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/manage-medicine', (req, res) => {
  res.render('manage-medicine');
});

router.put('/update-medicine/:id', async (req, res) => {
  try {
    const { name, quantity, price } = req.body;
    await Medicine.findByIdAndUpdate(req.params.id, { name, quantity, price });
    res.status(200).send("Updated");
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).send("Update failed");
  }
});

module.exports = router;
