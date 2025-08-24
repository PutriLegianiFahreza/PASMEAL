const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');
const kiosController = require('../controllers/kiosController');
const menuController = require('../controllers/menuController'); 

// Profile Kios penjual
router.get('/profil', authMiddleware, kiosController.getKiosByPenjual); 
router.put("/:id", authMiddleware, (req, res, next) => {
  console.log("Content-Type:", req.headers['content-type']);
  console.log("Body keys:", Object.keys(req.body));
  next();
}, upload.single("gambar_kios"), kiosController.updateKios);

// Buat kios baru penjual
router.post('/', authMiddleware, kiosController.createKios);

// Endpoint Kios untuk pembeli
router.get('/homepage', kiosController.getKiosHomepage);
router.get('/search', kiosController.searchKios);

// urutan id harus paling bawah
router.get('/:id/menus/search', menuController.searchMenusByKios);
router.get('/:id/menus', kiosController.getMenusByKios);
router.get('/:id', kiosController.getKiosDetail);
router.get('/', kiosController.getAllKios);

module.exports = router;
