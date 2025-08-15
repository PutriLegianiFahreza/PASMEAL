const pool = require('../config/db');
const { sendWhatsAppOTP } = require('../utils/wa');

const createKios = async (req, res) => {
  const penjual_id = req.user.id; // ambil dari token, jangan dari body
  const { nama_kios, nama_bank, nomor_rekening } = req.body;

  if (!penjual_id) {
    return res.status(400).json({ message: 'penjual_id diperlukan' });
  }

  try {
    // Pastikan penjual ada (tidak harus verified karena sudah dicek middleware)
    const penjual = await pool.query('SELECT * FROM penjual WHERE id = $1', [penjual_id]);
    if (penjual.rows.length === 0) {
      return res.status(400).json({ message: 'Penjual tidak valid' });
    }

    // Cek apakah kios sudah ada
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

    // Generate OTP
    const kode_otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiredAt = new Date(Date.now() + 3 * 60 * 1000); // 3 menit

    // Simpan OTP
    await pool.query(`
      INSERT INTO otp (penjual_id, otp_code, expired_at, is_used)
      VALUES ($1, $2, $3, FALSE)
    `, [penjual_id, kode_otp, expiredAt]);

    // Kirim OTP ke WhatsApp
    await sendWhatsAppOTP(penjual.rows[0].no_hp, kode_otp);

    res.status(201).json({ message: 'Kios berhasil didaftarkan dan OTP telah dikirim ke WhatsApp' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan saat membuat kios' });
  }
};

// Ambil beberapa kios untuk homepage
const getKiosHomepage = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM kios ORDER BY created_at DESC LIMIT 10'
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

//profile kios

const getKiosByPenjual = async (req, res) => {
    const penjualId = req.user?.id;

    if (!penjualId) {
        return res.status(401).json({ message: 'Tidak ada ID penjual' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM kios WHERE penjual_id = $1',
            [penjualId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Kios tidak ditemukan' });
        }

        res.json({ message: 'Data kios berhasil diambil', data: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Gagal mengambil data kios' });
    }
};

const updateKios = async (req, res) => {
    const { nama_kios, deskripsi, nama_bank, nomor_rekening } = req.body;
    const penjualId = req.user?.id;

    if (!penjualId) {
        return res.status(401).json({ message: 'Tidak ada ID penjual' });
    }

    try {
        // Ambil data kios lama
        const { rows, rowCount } = await pool.query(
            'SELECT * FROM kios WHERE penjual_id = $1',
            [penjualId]
        );

        if (rowCount === 0) {
            return res.status(404).json({ message: 'Kios tidak ditemukan' });
        }

        const oldKios = rows[0];

        // Buat URL lengkap untuk gambar jika ada upload baru
        const gambar_kios = req.file 
            ? `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}` 
            : oldKios.gambar_kios;

        // Update, tapi kalau field baru tidak dikirim pakai value lama
        const result = await pool.query(
            `UPDATE kios 
             SET nama_kios = COALESCE($1, $2),
                 deskripsi = COALESCE($3, $4),
                 nama_bank = COALESCE($5, $6),
                 nomor_rekening = COALESCE($7, $8),
                 gambar_kios = $9
             WHERE penjual_id = $10
             RETURNING *`,
            [
                nama_kios, oldKios.nama_kios,
                deskripsi, oldKios.deskripsi,
                nama_bank, oldKios.nama_bank,
                nomor_rekening, oldKios.nomor_rekening,
                gambar_kios,
                penjualId
            ]
        );

        res.json({
            message: 'Data kios berhasil diperbarui',
            data: result.rows[0]
        });
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
  updateKios,
  getKiosByPenjual
};
