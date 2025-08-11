const express = require('express');
const router = express.Router();
const penjualController = require('../controllers/penjualController');
const authMiddleware = require('../middlewares/authMiddleware'); // pastikan ini ada

router.put('/profil', authMiddleware, penjualController.updateProfil);

module.exports = router;
