const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');
const kiosController = require('../controllers/kiosController');
const menuController = require('../controllers/menuController'); // Untuk searchMenusByKios

// Buat kios baru (hanya penjual)
router.post('/', authMiddleware, kiosController.createKios);

// Endpoint Kios
router.get('/homepage', kiosController.getKiosHomepage);
router.get('/search', kiosController.searchKios);
router.get('/', kiosController.getAllKios);
router.get('/:id/menus', kiosController.getMenusByKios);
router.get('/:id', kiosController.getKiosDetail);


// ✅ Tambahkan pencarian menu di kios tertentu
router.get('/:id/menus/search', menuController.searchMenusByKios);

// 🔹 Profile Kios
router.get('/profil', authMiddleware, kiosController.getKiosByPenjual); // GET data kios milik penjual
router.put('/profil', authMiddleware, upload.single('gambar_kios'), kiosController.updateKios); // UPDATE data kios milik penjual

module.exports = router;
