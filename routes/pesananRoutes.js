// routes/pesananRoutes.js
const express = require('express');
const router = express.Router();
const pesananController = require('../controllers/pesananController');
const { verifiedMiddleware } = require('../middlewares/authMiddleware');

// Buat pesanan dari keranjang
router.post('/pesanan', pesananController.buatPesanan);

// Ambil daftar pesanan by guest_id
router.get('/pesanan', pesananController.getPesananByGuest);

// Ambil detail pesanan by id (untuk pembeli)
router.get('/pesanan/:id', pesananController.getDetailPesanan);

// Ambil daftar pesanan masuk (urut dari yang paling lama bayar) untuk penjual
router.get('/pesanan-masuk', verifiedMiddleware, pesananController.getPesananMasuk);

// Ambil detail pesanan masuk (untuk penjual lihat status)
router.get('/pesanan-masuk/:id', verifiedMiddleware, pesananController.getDetailPesananMasuk);

//update status pesanan 
router.patch('/pesanan/:id/status', verifiedMiddleware, pesananController.updateStatusPesanan);


module.exports = router;
