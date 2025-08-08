const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('../routes/authRoutes');
const { connectToWhatsApp } = require('../services/whatsapp');
const kiosRoutes = require('../routes/kiosRoutes');
const menuRoutes = require('../routes/menuRoutes');
const dashboardRoutes = require('../routes/dashboardRoutes');
const serverless = require('serverless-http');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

app.use('/login', authRoutes);
app.use('/kios', kiosRoutes);
app.use('/menu', menuRoutes);
app.use('/dashboard', dashboardRoutes);

app.get('/', (req, res) => {
  res.send('PasMeal API Backend is running...');
  connectToWhatsApp();
});

module.exports = app;
module.exports.handler = serverless(app);
