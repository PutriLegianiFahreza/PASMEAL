const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { getDashboardPenjual } = require('../controllers/dashboardController');

router.get('/', authMiddleware, getDashboardPenjual);

module.exports = router;
