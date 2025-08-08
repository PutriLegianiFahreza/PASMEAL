const pool = require('../config/db');

const createKios = async (req, res) => {
  const { nama_kios, nama_rekening, nomor_rekening } = req.body;
  const penjualId = req.user.id;

  try {
    // Cek apakah kios sudah pernah didaftarkan oleh penjual ini
    const cek = await pool.query('SELECT * FROM kios WHERE penjual_id = $1', [penjualId]);
    if (cek.rows.length > 0) {
      return res.status(409).json({ message: 'Kios sudah terdaftar' });
    }

    // Masukkan data kios tanpa deskripsi & foto
    await pool.query(`
      INSERT INTO kios (penjual_id, nama_kios, nama_rekening, nomor_rekening)
      VALUES ($1, $2, $3, $4)
    `, [penjualId, nama_kios, nama_rekening, nomor_rekening]);

    res.status(201).json({ message: 'Kios berhasil didaftarkan' });
  } catch (err) {
    console.error('Gagal membuat kios:', err);
    res.status(500).json({ message: 'Terjadi kesalahan saat membuat kios' });
  }
};

module.exports = { createKios };
