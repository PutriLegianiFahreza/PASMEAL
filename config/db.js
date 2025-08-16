const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.connect()
  .then(() => console.log('Berhasil konek ke database'))
  .catch(err => console.error('Gagal konek ke database:', err));

module.exports = pool;
