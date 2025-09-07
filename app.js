const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const mainRoutes = require('./routes/main');
const profileRoutes = require('./routes/profile');
const medicineRoutes = require('./routes/medicine');
const billRoutes = require('./routes/bill');
const orderRoutes = require('./routes/order');
const transactionRoutes = require('./routes/transactions');

const app = express();
const PORT = process.env.PORT || 3000;

mongoose.connect('mongodb+srv://rishi123:Folafa55@cluster1.kkasqtx.mongodb.net/pharmacy', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch((err) => console.error('❌ MongoDB connection error:', err));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'pharmacySecretKey',
  resave: false,
  saveUninitialized: false,
}));

app.use('/', authRoutes);
app.use('/', mainRoutes);
app.use('/profile', profileRoutes);
app.use('/', medicineRoutes);
app.use('/', billRoutes);
app.use('/', orderRoutes);
app.use('/', transactionRoutes);

app.use((req, res) => {
  res.status(404).send('404 - Page Not Found');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
