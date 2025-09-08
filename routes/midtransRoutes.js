const express = require('express');
const rateLimit = require('express-rate-limit');
const verifyMidtransSignature = require('../middlewares/verifyMidtransSignature');
const { createTransaction, handleNotification } = require('../controllers/midtransController');

const router = express.Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// FE endpoint (tidak perlu verifikasi signature)
router.post('/create-transaction', createTransaction);

// Webhook Midtrans
router.post(
  '/notification',
  webhookLimiter,
  verifyMidtransSignature,   // ⬅️ pastikan ini aktif
  handleNotification
);

module.exports = router;
