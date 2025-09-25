require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const serverless = require('serverless-http');
const path = require('path');

const app = express();

// Core security & infra middleware 
app.set('trust proxy', 1);

// Izinkan load asset lintas origin (gambar, dsb)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(express.json({ limit: '1mb' }));

// CORS 
const STATIC_ORIGINS = [
  'https://pas-meal.vercel.app',       // FE penjual
  'https://pas-meal-2rlb.vercel.app',  // FE pembeli
  'http://localhost:5173',
  'http://localhost:3000',
];

const ENV_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// render dynamic origin pattern
const allowByPattern = (origin = '') =>
  /^https:\/\/pas-meal(-[a-z0-9-]+)?\.vercel\.app$/.test(origin);

const ALLOW_ORIGINS = new Set([...STATIC_ORIGINS, ...ENV_ORIGINS]);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // Postman/cURL
      if (ALLOW_ORIGINS.has(origin) || allowByPattern(origin)) return cb(null, true);
      return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    // credentials: false, // default; jangan true kalau tidak pakai cookie
  })
);

// Debug request ringkas
app.use(
  morgan((tokens, req, res) =>
    [
      tokens.method(req, res),
      tokens.url(req, res),
      tokens.status(req, res),
      `origin=${req.headers.origin || '-'}`,
      tokens['response-time'](req, res), 'ms',
    ].join(' ')
  )
);

// Routes
const authRoutes = require('./routes/authRoutes');
const kiosRoutes = require('./routes/kiosRoutes');
const menuRoutes = require('./routes/menuRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const searchRoutes = require('./routes/searchRoutes');
const keranjangRoutes = require('./routes/keranjangRoutes');
const pesananRoutes = require('./routes/pesananRoutes');
const midtransRoutes = require('./routes/midtransRoutes');
const penjualRoutes = require('./routes/penjualRoutes');

// Healthcheck
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Static files (foto)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Prefix rute
app.use('/api', authRoutes);
app.use('/api/kios', kiosRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/search', searchRoutes);
app.use('/api', keranjangRoutes);
app.use('/api', pesananRoutes);
app.use('/api/midtrans', midtransRoutes);
app.use('/api/penjual', penjualRoutes);

// Root
app.get('/', (req, res) => {
  res.send('PasMeal API Backend is running...');
});

// 404 handler 
app.use((req, res) => res.status(404).json({ message: 'Endpoint tidak ditemukan' }));

//Error handler 
const errorHandler = require('./middlewares/errorHandler');
app.use(errorHandler);

// Exports 
module.exports = app;
module.exports.handler = serverless(app);

// LOCAL only (bukan serverless)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Opsional: start WhatsApp service
    setImmediate(async () => {
      try {
        const { connectToWhatsApp } = require('./services/whatsapp');
        await connectToWhatsApp();
        console.log('WhatsApp service started');
      } catch (err) {
        console.error('Failed to start WhatsApp service:', err);
      }
    });
  });
}
