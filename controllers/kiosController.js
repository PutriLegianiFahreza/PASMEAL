const pool = require('../config/db');

const createKios = async (req, res) => {
  const { nama_kios, deskripsi } = req.body;
  const penjualId = req.user.id;
  const foto_kios = req.file ? req.file.path : null; // path ke file lokal

  try {
    const cek = await pool.query('SELECT * FROM kios WHERE penjual_id = $1', [penjualId]);
    if (cek.rows.length > 0) {
      return res.status(409).json({ message: 'Kios sudah terdaftar' });
    }

    await pool.query(`
      INSERT INTO kios (penjual_id, nama_kios, deskripsi, foto_kios)
      VALUES ($1, $2, $3, $4)
    `, [penjualId, nama_kios, deskripsi, foto_kios]);

    res.status(201).json({ message: 'Kios berhasil didaftarkan' });
  } catch (err) {
    console.error('Gagal membuat kios:', err);
    res.status(500).json({ message: 'Terjadi kesalahan saat membuat kios' });
  }
};

module.exports = { createKios };
