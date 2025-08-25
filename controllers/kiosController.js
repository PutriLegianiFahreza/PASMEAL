const pool = require('../config/db');
const { sendWhatsAppOTP } = require('../utils/wa');
const cloudinary = require('../utils/cloudinary');
const fs = require('fs');

// registrasi kios penjual
const createKios = async (req, res) => {
  const penjual_id = req.user.id; 
  const { nama_kios, nama_bank, nomor_rekening } = req.body;

  if (!penjual_id) return res.status(400).json({ message: 'penjual_id diperlukan' });

  try {
    // cek apakah penjual valid
    const penjual = await pool.query('SELECT * FROM penjual WHERE id = $1', [penjual_id]);
    if (penjual.rows.length === 0) {
      return res.status(400).json({ message: 'Penjual tidak valid' });
    }

    const noHp = penjual.rows[0].no_hp;
    if (!noHp) {
      return res.status(400).json({ message: 'Nomor WhatsApp penjual belum terdaftar' });
    }

    // cek apakah penjual sudah punya kios
    const cek = await pool.query('SELECT * FROM kios WHERE penjual_id = $1', [penjual_id]);
    if (cek.rows.length > 0) {
      return res.status(409).json({ message: 'Kios sudah terdaftar untuk penjual ini' });
    }

    // cek apakah nama kios sudah dipakai (unik)
    const cekNamaKios = await pool.query(
      'SELECT * FROM kios WHERE LOWER(nama_kios) = LOWER($1)',
      [nama_kios]
    );
    if (cekNamaKios.rows.length > 0) {
      return res.status(409).json({ message: 'Nama kios telah digunakan, silakan pilih nama lain' });
    }

    // insert kios baru
    const result = await pool.query(`
      INSERT INTO kios (penjual_id, nama_kios, nama_bank, nomor_rekening)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [penjual_id, nama_kios, nama_bank, nomor_rekening]);

    // generate OTP
    const kode_otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiredAt = new Date(Date.now() + 3 * 60 * 1000); // 3 menit

    // hapus OTP aktif sebelumnya
    await pool.query(`DELETE FROM otp WHERE penjual_id = $1 AND is_used = FALSE`, [penjual_id]);

    await pool.query(`
      INSERT INTO otp (penjual_id, otp_code, expired_at, is_used)
      VALUES ($1, $2, $3, FALSE)
    `, [penjual_id, kode_otp, expiredAt]);

    // kirim OTP ke WA (try/catch supaya tidak crash kalau koneksi WA down)
    (async () => {
      try {
        const { sendWhatsAppOTP } = require('../utils/wa');
        await sendWhatsAppOTP(noHp, kode_otp);
        console.log(`OTP dikirim ke ${noHp}`);
      } catch (err) {
        console.error('Gagal kirim OTP WA:', err.message);
      }
    })();

    return res.status(201).json({
      message: 'Kios berhasil didaftarkan dan OTP telah dikirim ke WhatsApp',
      data: result.rows[0]
    });

  } catch (err) {
    // cek error unik (duplicate key di DB)
    if (err.code === "23505") {
      return res.status(409).json({ message: "Nama kios sudah digunakan" });
    }

    console.error(err);
    return res.status(500).json({ message: "Terjadi kesalahan saat membuat kios" });
  }
};

// MENAMPILKAN 8 KIOS DI HOMEPAGE(pembeli)
const getKiosHomepage = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kios ORDER BY created_at DESC LIMIT 8');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// SEARCH KIOS(pembeli)
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

// Ambil semua kios(pembeli)
const getAllKios = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kios ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Ambil menu berdasarkan kios(pembeli)
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

//profile kios(penjual)
const getKiosByPenjual = async (req, res) => {
  const penjualId = req.user?.id;
  if (!penjualId) return res.status(401).json({ message: 'Tidak ada ID penjual' });

  try {
    const result = await pool.query('SELECT * FROM kios WHERE penjual_id = $1', [penjualId]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Kios tidak ditemukan' });
    res.json({ message: 'Data kios berhasil diambil', data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil data kios' });
  }
};

//UPDATE PROFILE KIOS(penjual)
const updateKios = async (req, res) => {
  try {
    const kiosId = parseInt(req.params.id, 10);
    if (isNaN(kiosId)) {
      return res.status(400).json({ message: "ID kios harus berupa angka" });
    }

    const { nama_kios, deskripsi, nomor_rekening, nama_bank } = req.body;

    // cek kios ada atau tidak
    const kios = await pool.query("SELECT * FROM kios WHERE id = $1", [kiosId]);
    if (kios.rows.length === 0) {
      return res.status(404).json({ message: "Kios tidak ditemukan" });
    }

    let gambarUrl = kios.rows[0].gambar_kios; // fallback: pakai gambar lama

    console.log("req.file:", req.file); // debug file upload

    // kalau ada file baru → upload ke cloudinary
    if (req.file) {
      const upload = await cloudinary.uploader.upload(req.file.path, { folder: "kios" });
      gambarUrl = upload.secure_url;

      // hapus file lokal setelah upload
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Gagal hapus file lokal:", err);
      });
    }

    // gunakan nilai lama jika field tidak dikirim
    const updatedNama = nama_kios ?? kios.rows[0].nama_kios;
    const updatedDeskripsi = deskripsi ?? kios.rows[0].deskripsi;
    const updatedNomorRek = nomor_rekening ?? kios.rows[0].nomor_rekening;
    const updatedNamaBank = nama_bank ?? kios.rows[0].nama_bank;

    // update data kios
    const result = await pool.query(
      `UPDATE kios 
       SET nama_kios = $1, deskripsi = $2, nomor_rekening = $3, nama_bank = $4, gambar_kios = $5
       WHERE id = $6
       RETURNING *`,
      [updatedNama, updatedDeskripsi, updatedNomorRek, updatedNamaBank, gambarUrl, kiosId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan pada server" });
  }
};

// Ambil detail kios berdasarkan kios_id (pembeli)
const getKiosDetail = async (req, res) => {
  try {
    const kiosId = req.params.id;
    const result = await pool.query(`
      SELECT k.id, k.nama_kios, k.deskripsi, k.gambar_kios
      FROM kios k
      JOIN penjual p ON k.penjual_id = p.id
      WHERE k.id = $1
    `, [kiosId]);

    if (result.rowCount === 0) return res.status(404).json({ message: 'Kios tidak ditemukan' });

    res.json({ message: 'Detail kios berhasil diambil', data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil detail kios' });
  }
};

module.exports = { 
  createKios,
  getKiosHomepage,
  searchKios,
  getAllKios,
  getMenusByKios,
  updateKios,
  getKiosByPenjual, 
  getKiosDetail
};
