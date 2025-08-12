const express = require('express');
const router = express.Router();
const { updateStatusPesanan } = require('../controllers/updateStatusPesanan');

router.patch('/status', updateStatusPesanan);

module.exports = router;
