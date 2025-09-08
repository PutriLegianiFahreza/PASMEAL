// index.js
require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const serverless = require('serverless-http');
const path = require('path');

const app = express();

/* ---------- Core security & infra middleware ---------- */
app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());

// ==== CORS Setup ====
// Domain FE utama
const STATIC_ORIGINS = [
  'https://pas-meal.vercel.app',       // FE utama
  'https://pas-meal-2rlb.vercel.app',  // FE pembeli
  'http://localhost:5173',             // vite dev
  'http://localhost:3000'              // react dev
];

// Dari .env kalau ada (CORS_ORIGINS="https://foo.com,https://bar.com")
const ENV_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const ALLOW_ORIGINS = [...new Set([...STATIC_ORIGINS, ...ENV_ORIGINS])];

app.use(cors({
  origin: (origin, cb) => {
    // izinkan Postman/cURL (origin null) & daftar white-list
    if (!origin || ALLOW_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true
}));

// ==== Body parser ====
app.use(express.json({ limit: '1mb' }));

// ==== Request logger ====
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ==== Rate limiter ====
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false
}));

// Debug rute (opsional)
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[${req.method}] ${req.originalUrl}`);
  }
  next();
});

/* -------------------------- Routes -------------------------- */
const authRoutes = require('./routes/authRoutes');
const kiosRoutes = require('./routes/kiosRoutes');
const menuRoutes = require('./routes/menuRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const searchRoutes = require('./routes/searchRoutes');
const keranjangRoutes = require('./routes/keranjangRoutes');
const pesananRoutes = require('./routes/pesananRoutes');
const midtransRoutes = require('./routes/midtransRoutes');
const penjualRoutes = require('./routes/penjualRoutes');

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', authRoutes);
app.use('/api/kios', kiosRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/search', searchRoutes);
app.use('/api', keranjangRoutes);
app.use('/api', pesananRoutes);
app.use('/api/midtrans', midtransRoutes);
app.use('/api/penjual', penjualRoutes);

app.get('/', (req, res) => {
  res.send('PasMeal API Backend is running...');
});

/* --------------- 404 handler --------------- */
app.use((req, res) => res.status(404).json({ message: 'Endpoint tidak ditemukan' }));

/* ----------------- Error handler ----------------- */
const errorHandler = require('./middlewares/errorHandler');
app.use(errorHandler);

/* ----------------- Exports ----------------- */
module.exports = app;
module.exports.handler = serverless(app);

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // WhatsApp service (hanya di local/server non-serverless)
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
