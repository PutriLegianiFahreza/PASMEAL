const express = require('express');
const router = express.Router();
const penjualController = require('../controllers/penjualController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// Ambil data profil penjual
router.get('/profil', authMiddleware, penjualController.getProfile);

// Update data profil penjual
router.put('/profil', authMiddleware, penjualController.updateProfil);

module.exports = router;
