const express = require('express');
const router = express.Router();
const pesananController = require('../controllers/pesananController');

// Buat pesanan dari keranjang
router.post('/pesanan', pesananController.buatPesanan);

// Ambil daftar pesanan by guest_id (query)
router.get('/pesanan', pesananController.getPesananByGuest);

// Ambil detail pesanan by id
router.get('/pesanan/:id', pesananController.getDetailPesanan);

module.exports = router;
