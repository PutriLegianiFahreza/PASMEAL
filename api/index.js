const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const serverless = require('serverless-http');

// Import routes dan service (path harus ../ karena file ada di /api)
const authRoutes = require('../routes/authRoutes');
const { connectToWhatsApp } = require('../services/whatsapp');
const kiosRoutes = require('../routes/kiosRoutes');
const menuRoutes = require('../routes/menuRoutes');
const dashboardRoutes = require('../routes/dashboardRoutes');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', authRoutes);
app.use('/api/kios', kiosRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Root check
app.get('/', (req, res) => {
  res.send('PasMeal API Backend is running...');
  connectToWhatsApp();
});

// Ekspor handler untuk Vercel
module.exports = app;
module.exports.handler = serverless(app);

// Kalau dijalankan lokal, start server biasa
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
    connectToWhatsApp();
  });
}
