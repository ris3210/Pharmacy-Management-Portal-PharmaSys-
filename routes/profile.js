const express = require('express');
const router = express.Router();
const User = require('../models/User');

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login');
}

router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id).select('-password').lean();
    res.render('profile', { user });
  } catch (err) {
    console.error(err);
    res.redirect('/dashboard');
  }
});

router.post('/update-profile', isAuthenticated, async (req, res) => {
  const { shopName, mobile, email, address } = req.body;

  try {
    await User.findByIdAndUpdate(req.session.user._id, {
      shopName: shopName?.trim(),
      mobile: mobile?.trim(),
      email: email?.trim(),
      address: address?.trim()
    });

    return res.status(200).json({ success: true, message: "Profile updated successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Failed to update profile" });
  }
});

module.exports = router;
