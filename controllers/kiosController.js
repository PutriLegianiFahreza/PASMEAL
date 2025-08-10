const pool = require('../config/db');

const createKios = async (req, res) => { 
 console.log("Decoded user:", req.user);
  console.log("Request body:", req.body);

  const { nama_kios, nama_bank, nomor_rekening } = req.body;
  const penjualId = req.user?.id; // amanin kalau req.user undefined

  console.log("📩 Data yang diterima untuk membuat kios:", {
    penjualId,
    nama_kios,
    nama_bank,
    nomor_rekening
  });

  try {
    // Cek apakah penjualId valid
    if (!penjualId) {
      console.error("❌ penjualId tidak ditemukan di req.user");
      return res.status(400).json({ message: 'User tidak valid atau belum login' });
    }

    // Cek apakah kios sudah pernah didaftarkan oleh penjual ini
    const cek = await pool.query('SELECT * FROM kios WHERE penjual_id = $1', [penjualId]);
    console.log(`📊 Kios ditemukan: ${cek.rows.length} untuk penjualId ${penjualId}`);
    
    if (cek.rows.length > 0) {
      return res.status(409).json({ message: 'Kios sudah terdaftar' });
    }

    // Masukkan data kios
    const result = await pool.query(`
      INSERT INTO kios (penjual_id, nama_kios, nama_bank, nomor_rekening)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [penjualId, nama_kios, nama_bank, nomor_rekening]);

    console.log("✅ Kios berhasil dibuat:", result.rows[0]);
    res.status(201).json({ message: 'Kios berhasil didaftarkan', data: result.rows[0] });
    
  } catch (err) {
    console.error('❌ Gagal membuat kios:', err.message);
    console.error(err.stack);
    res.status(500).json({ 
      message: 'Terjadi kesalahan saat membuat kios', 
      error: err.message // tampilkan ke Postman untuk debug
    });
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

module.exports = { 
  createKios,
  getKiosHomepage,
  searchKios,
  getAllKios,
  getMenusByKios
};
