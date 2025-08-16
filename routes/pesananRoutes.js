const express = require('express');
const router = express.Router();
const pesananController = require('../controllers/pesananController');
const { verifiedMiddleware } = require('../middlewares/authMiddleware');

// Buat pesanan dari keranjang(pembeli)
router.post('/pesanan', pesananController.buatPesanan);

// Ambil daftar pesanan by guest_id(penjual)
router.get('/pesanan', pesananController.getPesananByGuest);

// Riwayat pesanan(penjual)
router.get('/pesanan/riwayat', verifiedMiddleware, pesananController.getRiwayatPesanan);

// Ambil daftar pesanan masuk (penjual)
router.get('/pesanan-masuk', verifiedMiddleware, pesananController.getPesananMasuk);

// Ambil detail pesanan masuk (untuk penjual lihat status)
router.get('/pesanan-masuk/:id', verifiedMiddleware, pesananController.getDetailPesananMasuk);

// Update status pesanan (penjual)
router.patch('/pesanan/:id/status', verifiedMiddleware, pesananController.updateStatusPesanan);

// Ambil detail pesanan by id (untuk pembeli)
router.get('/pesanan/:id', pesananController.getDetailPesanan);

module.exports = router;
