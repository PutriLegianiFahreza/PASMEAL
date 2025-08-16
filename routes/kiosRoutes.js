const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');
const kiosController = require('../controllers/kiosController');
const menuController = require('../controllers/menuController'); 

// Profile Kios
router.get('/profil', authMiddleware, kiosController.getKiosByPenjual); 
router.put('/profil', authMiddleware, upload.single('gambar_kios'), kiosController.updateKios); 

// Buat kios baru 
router.post('/', authMiddleware, kiosController.createKios);

// Endpoint Kios
router.get('/homepage', kiosController.getKiosHomepage);
router.get('/search', kiosController.searchKios);
router.get('/', kiosController.getAllKios);
router.get('/:id/menus', kiosController.getMenusByKios);
router.get('/:id', kiosController.getKiosDetail);


// Tambahkan pencarian menu di kios tertentu
router.get('/:id/menus/search', menuController.searchMenusByKios);

module.exports = router;
