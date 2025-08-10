const express = require('express');
const router = express.Router();
const keranjangController = require('../controllers/keranjangController');

// Tambah ke keranjang (body: guest_id/header x-buyer-id optional)
router.post('/keranjang', keranjangController.addToKeranjang);

// Ambil isi keranjang (query guest_id or header x-buyer-id)
router.get('/keranjang', keranjangController.getKeranjang);

// Update item keranjang (jumlah / catatan)
router.put('/keranjang/:id', keranjangController.updateKeranjangItem);

// Hapus item
router.delete('/keranjang/:id', keranjangController.removeFromKeranjang);

module.exports = router;
