const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');
const kiosController = require('../controllers/kiosController');

router.post('/', authMiddleware, kiosController.createKios);

module.exports = router;
