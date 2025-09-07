const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../models/User');

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[,?@#\.])[A-Za-z\d,?@#\.]{8,}$/;

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login');
}

router.get('/register', (req, res) => {
  res.render('register', { error: null, success: null });
});

router.post('/register', async (req, res) => {
  let { username, password, confirmPassword, shopName, mobile, email, address } = req.body;

  username = username?.trim();
  password = password?.trim();
  confirmPassword = confirmPassword?.trim();
  shopName = shopName?.trim();
  mobile = mobile?.trim();
  email = email?.trim();
  address = address?.trim();

  if (!username || !password || !confirmPassword) {
    return res.render('register', { error: '❌ Username & password are required', success: null });
  }

  if (password !== confirmPassword) {
    return res.render('register', { error: '❌ Passwords do not match', success: null });
  }

  if (!passwordRegex.test(password)) {
    return res.render('register', {
      error: '❌ Password must be at least 8 characters with uppercase, lowercase, number & special character (,?@#.)',
      success: null
    });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.render('register', { error: '❌ Username already exists', success: null });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await new User({
      username,
      password: hashedPassword,
      shopName,
      mobile,
      email,
      address
    }).save();

    return res.render('register', {
      error: null,
      success: '✅ Registration successful! Redirecting to login...'
    });

  } catch (err) {
    console.error('Registration error:', err);
    return res.render('register', { error: '❌ Registration failed. Try again later.', success: null });
  }
});

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  let { username, password } = req.body;
  username = username?.trim();
  password = password?.trim();

  if (!username || !password) {
    return res.render('login', { error: '❌ All fields are required' });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.render('login', { error: '❌ Invalid username or password' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render('login', { error: '❌ Invalid username or password' });
    }

    req.session.user = { _id: user._id, username: user.username };

    req.session.save(err => {
      if (err) {
        console.error('Session save error:', err);
        return res.render('login', { error: '❌ Session error. Try again.' });
      }
      return res.redirect('/dashboard');
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.render('login', { error: '❌ Login failed. Try again later.' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.clearCookie('connect.sid');
    return res.redirect('/login');
  });
});

module.exports = router;
