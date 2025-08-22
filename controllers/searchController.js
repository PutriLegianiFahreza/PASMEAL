const pool = require('../config/db');

const searchAll = async (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ message: 'Query pencarian wajib diisi' });
  }

  try {
    const kiosResult = await pool.query(
      'SELECT * FROM kios WHERE nama_kios ILIKE $1 ORDER BY id DESC',
      [`%${query}%`]
    );

    const menuResult = await pool.query(
      `SELECT m.*, k.id AS kios_id, k.nama_kios 
       FROM menu m
       JOIN kios k ON m.kios_id = k.id
       WHERE m.nama_menu ILIKE $1
       ORDER BY m.id DESC`,
      [`%${query}%`]
    );

    res.json({
      kios: kiosResult.rows,
      menus: menuResult.rows
    });

  } catch (err) {
    console.error('Gagal melakukan pencarian:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

module.exports = {
  searchAll
};