const express = require('express');
const { createTransaction, handleNotification } = require('../controllers/midtransController');

const router = express.Router();

router.post('/create-transaction', createTransaction);
router.post('/notification', handleNotification); // webhook endpoint

module.exports = router;
