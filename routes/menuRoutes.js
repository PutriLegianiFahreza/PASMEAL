const express = require('express');
const router = express.Router();
const { authMiddleware, verifiedMiddleware } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');
const menuController = require('../controllers/menuController');

// Ambil 5 menu terbaru (pembeli)
router.get('/new', menuController.getNewMenus);

// Cari menu (pembeli)
router.get('/search', menuController.searchMenus);

// Cari menu di kios tertentu (pembeli)
router.get('/kios/:id/search', menuController.searchMenusByKios);

// Ambil semua menu penjual
router.get('/', authMiddleware, menuController.getAllMenu);

// Pagination untuk penjual
router.get('/paginated', authMiddleware, menuController.getMenusPaginated);

// Tambah menu (penjual)
router.post('/', verifiedMiddleware, upload.single('foto_menu'), menuController.addMenu);

// Update menu (penjual)
router.put('/:id', verifiedMiddleware, upload.single('foto_menu'), menuController.updateMenu);

// Hapus menu (penjual)
router.delete('/:id', verifiedMiddleware, menuController.deleteMenu);

// Detail menu untuk pembeli
router.get('/buyer/:id', menuController.getMenuByIdForBuyer);

// Detail menu untuk penjual
router.get('/seller/:id', authMiddleware, menuController.getMenuById);

module.exports = router;
