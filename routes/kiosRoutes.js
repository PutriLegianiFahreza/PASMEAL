const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');
const kiosController = require('../controllers/kiosController');
const menuController = require('../controllers/menuController'); // ⬅ ini yang kurang

// Buat kios baru (hanya penjual)
router.post('/', authMiddleware, kiosController.createKios);

// Endpoint Kios
router.get('/homepage', kiosController.getKiosHomepage);
router.get('/search', kiosController.searchKios);
router.get('/', kiosController.getAllKios);
router.get('/:id/menus', kiosController.getMenusByKios);

// ✅ Tambahkan pencarian menu di kios tertentu
router.get('/:id/menus/search', menuController.searchMenusByKios);

//profile
router.put('/', authMiddleware, upload.single('gambar_kios'), kiosController.updateKios);

module.exports = router;
