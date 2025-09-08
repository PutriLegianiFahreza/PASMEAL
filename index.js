// index.js
require('dotenv').config();
require('express-async-errors'); // biar throw di async otomatis ke error handler

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
app.set('trust proxy', 1); // penting kalau di belakang proxy (Vercel/Render/Nginx)
app.use(helmet());         // header keamanan
app.use(compression());    // kompresi respons

// CORS: batasi ke domain FE kamu. Tambah/ubah jika perlu.
const ALLOW_ORIGINS = [
  'https://pas-meal.vercel.app',
  process.env.CORS_ORIGIN // opsional dari env
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // izinkan tools lokal/postman (origin null) & daftar white-list
    if (!origin || ALLOW_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Body parser
app.use(express.json({ limit: '1mb' }));

// Request logger (ringkas di prod, lengkap di dev)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rate limit global (longgar agar tidak ganggu FE)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 1000,                 // 1000 request / IP / 15 menit
  standardHeaders: true,
  legacyHeaders: false
}));

// Debug minimal rute (opsional, boleh dihapus kalau morgan sudah cukup)
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

// Healthcheck sederhana buat monitoring
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Static files (foto)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Prefix rute — tidak diubah agar FE tetap cocok
app.use('/api', authRoutes);
app.use('/api/kios', kiosRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/search', searchRoutes);
app.use('/api', keranjangRoutes);
app.use('/api', pesananRoutes);
app.use('/api/midtrans', midtransRoutes);
app.use('/api/penjual', penjualRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.send('PasMeal API Backend is running...');
});

/* --------------- 404 handler (untuk rute tak dikenal) --------------- */
app.use((req, res) => {
  return res.status(404).json({ message: 'Endpoint tidak ditemukan' });
});

/* --------------------- Error handler terakhir --------------------- */
const errorHandler = require('./middlewares/errorHandler');
app.use(errorHandler);

/* ----------------- Exports untuk Serverless & Local ---------------- */
module.exports = app;
module.exports.handler = serverless(app);

// LOCAL: server listen + WhatsApp background
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Start WhatsApp service di background (non-blocking)
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
