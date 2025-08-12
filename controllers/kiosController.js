const pool = require('../config/db');

const createKios = async (req, res) => {
  const { penjual_id, nama_kios, nama_bank, nomor_rekening } = req.body;

  if (!penjual_id) {
    return res.status(400).json({ message: 'penjual_id diperlukan' });
  }

  try {
    // Pastikan penjual sudah verified
    const penjual = await pool.query('SELECT * FROM penjual WHERE id = $1 AND is_verified = TRUE', [penjual_id]);
    if (penjual.rows.length === 0) {
      return res.status(400).json({ message: 'Penjual tidak valid atau belum verifikasi' });
    }

    // Cek apakah kios sudah pernah dibuat
    const cek = await pool.query('SELECT * FROM kios WHERE penjual_id = $1', [penjual_id]);
    if (cek.rows.length > 0) {
      return res.status(409).json({ message: 'Kios sudah terdaftar' });
    }

    // Insert kios
    const result = await pool.query(`
      INSERT INTO kios (penjual_id, nama_kios, nama_bank, nomor_rekening)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [penjual_id, nama_kios, nama_bank, nomor_rekening]);

    res.status(201).json({ message: 'Kios berhasil didaftarkan', data: result.rows[0] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan saat membuat kios' });
  }
};

// Ambil beberapa kios untuk homepage
const getKiosHomepage = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM kios ORDER BY created_at DESC LIMIT 5'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cari kios
const searchKios = async (req, res) => {
  const { query } = req.query;
  try {
    const result = await pool.query(
      'SELECT * FROM kios WHERE LOWER(nama_kios) LIKE LOWER($1)',
      [`%${query}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Ambil semua kios
const getAllKios = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kios ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Ambil menu berdasarkan kios
const getMenusByKios = async (req, res) => {
  try {
    const kiosId = req.params.id;
    const result = await pool.query(
      'SELECT * FROM menu WHERE kios_id = $1 ORDER BY created_at DESC',
      [kiosId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateKios = async (req, res) => {
    const { nama_kios, deskripsi, nama_bank, nomor_rekening } = req.body;
    const penjualId = req.user?.id; // dari auth middleware
    const gambar_kios = req.file ? `/uploads/${req.file.filename}` : null;

    if (!penjualId) {
        return res.status(401).json({ message: 'Tidak ada ID penjual' });
    }

    try {
        await pool.query(
            `UPDATE kios 
             SET nama_kios = $1, deskripsi = $2, nama_bank = $3, nomor_rekening = $4, 
                 gambar_kios = COALESCE($5, gambar_kios)
             WHERE penjual_id = $6`,
            [nama_kios, deskripsi, nama_bank, nomor_rekening, gambar_kios, penjualId]
        );

        res.json({ message: 'Data kios berhasil diperbarui' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Gagal memperbarui data kios' });
    }
};


module.exports = { 
  createKios,
  getKiosHomepage,
  searchKios,
  getAllKios,
  getMenusByKios,
  updateKios
};
