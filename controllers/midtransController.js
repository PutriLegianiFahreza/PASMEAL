// controllers/midtransController.js (thin controller)
const {
  createTransactionService,
  handleNotificationService,
} = require('../services/midtransService');

// CREATE TRANSACTION
const createTransaction = async (req, res) => {
  try {
    const { status, body } = await createTransactionService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ message: "Gagal membuat transaksi" });
  }
};

// HANDLE MIDTRANS NOTIFICATION
const handleNotification = async (req, res) => {
  try {
    const { status, body } = await handleNotificationService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    // eslint-disable-next-line no-console
    console.error("[NOTIFICATION ERROR]", err);
    return res.status(500).json({ message: "Gagal memproses notifikasi" });
  }
};

module.exports = { 
  createTransaction, 
  handleNotification 
};
