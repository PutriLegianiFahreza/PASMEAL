const express = require('express');
const router = express.Router();
const keranjangController = require('../controllers/keranjangController');

// Tambah ke keranjang 
router.post('/keranjang', keranjangController.addToKeranjang);

// Ambil isi keranjang 
router.get('/keranjang', keranjangController.getKeranjang);

// Update item keranjang 
router.put('/keranjang/:id', keranjangController.updateKeranjangItem);

// Hapus item
router.delete('/keranjang/:id', keranjangController.removeFromKeranjang);

module.exports = router;
