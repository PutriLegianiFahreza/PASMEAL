const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { verifiedMiddleware } = require('../middlewares/authMiddleware');

router.get('/', verifiedMiddleware, dashboardController.getDashboardData);

module.exports = router;
