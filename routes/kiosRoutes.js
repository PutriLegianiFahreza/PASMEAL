const express = require('express');
const router = express.Router();
const kiosController = require('../controllers/kiosController');
const menuController = require('../controllers/menuController');

// Endpoint Kios
router.get('/homepage', kiosController.getKiosHomepage);
router.get('/search', kiosController.searchKios);
router.get('/', kiosController.getAllKios);
router.get('/:id/menus', kiosController.getMenusByKios);

// ✅ Tambahkan pencarian menu di kios tertentu
router.get('/:id/menus/search', menuController.searchMenusByKios);

module.exports = router;
