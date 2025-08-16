const express = require('express');
const router = express.Router();
const { searchAll } = require('../controllers/searchController');

// Search gabungan kios & menu
router.get('/', searchAll);

module.exports = router;
