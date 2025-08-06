const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');
const menuController = require('../controllers/menuController');

router.get('/', authMiddleware, menuController.getAllMenu);
router.post('/', authMiddleware, upload.single('foto'), menuController.addMenu);
router.get('/:id', authMiddleware, menuController.getMenuById);
router.put('/:id', authMiddleware, upload.single('foto'), menuController.updateMenu);
router.delete('/:id', authMiddleware, menuController.deleteMenu);

module.exports = router;
