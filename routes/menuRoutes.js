const express = require('express');
const router = express.Router();
const { authMiddleware, verifiedMiddleware } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');
const menuController = require('../controllers/menuController');


// Route publik untuk pembeli
router.get('/new', menuController.getNewMenus);
router.get('/search', menuController.searchMenus);
router.get('/kios/:id/search', menuController.searchMenusByKios);
router.get('/:id', menuController.getMenuByIdForBuyer);

// Route khusus penjual (butuh login)
router.get('/', authMiddleware, menuController.getAllMenu);
router.get('/:id', authMiddleware, menuController.getMenuById);
router.delete('/:id', authMiddleware, menuController.deleteMenu);
router.post('/', verifiedMiddleware, upload.single('foto_menu'), menuController.addMenu); 
router.put('/:id', authMiddleware, upload.single('foto_menu'), menuController.updateMenu);

module.exports = router;
