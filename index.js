const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const serverless = require('serverless-http');


// Load env variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Debug logger untuk request masuk
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
});

// Routes
const authRoutes = require('./routes/authRoutes');
const kiosRoutes = require('./routes/kiosRoutes');     // sudah termasuk getKiosHomepage, searchKios, getMenusByKios, kios/:id/search
const menuRoutes = require('./routes/menuRoutes');     // sudah termasuk searchMenus
const dashboardRoutes = require('./routes/dashboardRoutes');
const searchRoutes = require('./routes/searchRoutes'); // /search gabungan kios & menu
const keranjangRoutes = require('./routes/keranjangRoutes');
const pesananRoutes = require('./routes/pesananRoutes');
const midtransRoutes = require('./routes/midtransRoutes');
const penjualRoutes = require('./routes/penjualRoutes');


app.use('/api', authRoutes);
app.use('/api/kios', kiosRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/search', searchRoutes);
app.use('/api', keranjangRoutes);  // endpoints: /api/keranjang, dll
app.use('/api', pesananRoutes);   // endpoints: /api/pesanan, /api/pesanan/:id
app.use('/api/midtrans', midtransRoutes);
app.use('/api/penjual', penjualRoutes);



// Root endpoint
app.get('/', (req, res) => {
  res.send('PasMeal API Backend is running...');
});

// WhatsApp service (jalan di lokal & production)
const { connectToWhatsApp } = require('./services/whatsapp');
connectToWhatsApp()
  .then(() => console.log('📲 WhatsApp service started'))
  .catch(err => console.error('❌ Failed to start WhatsApp service:', err));

// Export untuk Serverless (Render / Vercel)
module.exports = app;
module.exports.handler = serverless(app);

// Kalau dijalankan langsung (lokal)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}
