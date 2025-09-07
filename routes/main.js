const express = require('express');
const router = express.Router();

function isAuthenticated(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
}

router.get('/', (req, res) => {
  res.render('home');
});

router.get('/features', (req, res) => {
  res.render('features');
});

router.get('/dashboard', isAuthenticated, (req, res) => {
  res.render('dashboard', { user: req.session.user });
});

module.exports = router;
