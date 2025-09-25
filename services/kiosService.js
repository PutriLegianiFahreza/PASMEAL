const pool = require('../config/db');
const { sendWhatsAppOTP } = require('../utils/wa');
const cloudinary = require('../utils/cloudinary');
const fs = require('fs');
const bcrypt = require('bcrypt');

const httpErr = (status, message) => {
  const e = new Error(message);
  e.status = status;
  return e;
};

// registrasi kios penjual
async function createKiosService(req) {
  const penjual_id = req.user.id;
  const { nama_kios, nama_bank, nomor_rekening } = req.body;

  if (!penjual_id) throw httpErr(400, 'penjual_id diperlukan');

  try {
    const penjual = await pool.query('SELECT * FROM penjual WHERE id = $1', [penjual_id]);
    if (penjual.rows.length === 0) throw httpErr(400, 'Penjual tidak valid');

    const noHp = penjual.rows[0].no_hp;
    if (!noHp) throw httpErr(400, 'Nomor WhatsApp penjual belum terdaftar');

    const cek = await pool.query('SELECT * FROM kios WHERE penjual_id = $1', [penjual_id]);
    if (cek.rows.length > 0) throw httpErr(409, 'Kios sudah terdaftar untuk penjual ini');

    const cekNamaKios = await pool.query(
      'SELECT * FROM kios WHERE LOWER(nama_kios) = LOWER($1)',
      [nama_kios]
    );
    if (cekNamaKios.rows.length > 0) throw httpErr(409, 'Nama kios telah digunakan, silakan pilih nama lain');

    const result = await pool.query(
      `INSERT INTO kios (penjual_id, nama_kios, nama_bank, nomor_rekening)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [penjual_id, nama_kios, nama_bank, nomor_rekening]
    );

    const kode_otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiredAt = new Date(Date.now() + 3 * 60 * 1000); // 3 menit

    await pool.query(`DELETE FROM otp WHERE penjual_id = $1 AND is_used = FALSE`, [penjual_id]);

    const otpHash = await bcrypt.hash(kode_otp, 10);

    await pool.query(
      `INSERT INTO otp (penjual_id, otp_code, expired_at, is_used)
       VALUES ($1, $2, $3, FALSE)`,
      [penjual_id, otpHash, expiredAt] 
    );

    Promise.resolve()
      .then(() => sendWhatsAppOTP(noHp, kode_otp))
      .then(() => console.log(`OTP dikirim ke ${noHp}`))
      .catch(err => console.error('Gagal kirim OTP WA:', err.message));

    return {
      status: 201,
      body: {
        message: 'Kios berhasil didaftarkan dan OTP telah dikirim ke WhatsApp',
        data: result.rows[0]
      }
    };
  } catch (err) {
    if (err.code === '23505') {
      throw httpErr(409, 'Nama kios sudah digunakan');
    }
    if (!err.status) err.status = 500;
    throw err;
  }
}

// MENAMPILKAN 8 KIOS DI HOMEPAGE (pembeli)
async function getKiosHomepageService() {
  const result = await pool.query(
    `SELECT id, nama_kios, deskripsi, gambar_kios
     FROM kios
     ORDER BY id DESC
     LIMIT 8`
  );
  return { status: 200, body: result.rows }; 
}

// SEARCH KIOS (pembeli)
async function searchKiosService(req) {
  const { query } = req.query;
  if (!query || query.trim() === '') {
    return { status: 200, body: [] }; 
  }
  const result = await pool.query(
    `SELECT id, nama_kios, deskripsi, gambar_kios
     FROM kios
     WHERE LOWER(nama_kios) LIKE LOWER($1)
     ORDER BY id DESC`,
    [`%${query}%`]
  );
  return { status: 200, body: result.rows }; 
}

// Ambil semua kios (pembeli)
async function getAllKiosService() {
  const result = await pool.query(
    `SELECT id, nama_kios, deskripsi, gambar_kios
     FROM kios
     ORDER BY id DESC`
  );
  return { status: 200, body: result.rows }; 
}

// Ambil menu berdasarkan kios (pembeli)
async function getMenusByKiosService(kiosId) {
  const result = await pool.query(
    `SELECT
       id,
       foto_menu,
       nama_menu,
       deskripsi,
       harga,
       estimasi_menit,
       status_tersedia,
       kios_id
     FROM menu
     WHERE kios_id = $1
     ORDER BY created_at DESC`,
    [kiosId]
  );
  return { status: 200, body: result.rows }; 
}


// profile kios (penjual)
async function getKiosByPenjualService(req) {
  const penjualId = req.user?.id;
  if (!penjualId) throw httpErr(401, 'Tidak ada ID penjual');

  const result = await pool.query('SELECT * FROM kios WHERE penjual_id = $1', [penjualId]);
  if (result.rowCount === 0) throw httpErr(404, 'Kios tidak ditemukan');

  return {
    status: 200,
    body: { message: 'Data kios berhasil diambil', data: result.rows[0] }
  };
}

// UPDATE PROFILE KIOS (penjual)
async function updateKiosService(req) {
  const kiosId = parseInt(req.params.id, 10);
  if (isNaN(kiosId)) throw httpErr(400, 'ID kios harus berupa angka');

  const { nama_kios, deskripsi, nomor_rekening, nama_bank } = req.body;

  const kios = await pool.query('SELECT * FROM kios WHERE id = $1', [kiosId]);
  if (kios.rows.length === 0) throw httpErr(404, 'Kios tidak ditemukan');

  let gambarUrl = kios.rows[0].gambar_kios; 

  console.log('req.file:', req.file); 

  if (req.file) {
    const upload = await cloudinary.uploader.upload(req.file.path, { folder: 'kios' });
    gambarUrl = upload.secure_url;

    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Gagal hapus file lokal:', err);
    });
  }

  const updatedNama = nama_kios ?? kios.rows[0].nama_kios;
  const updatedDeskripsi = deskripsi ?? kios.rows[0].deskripsi;
  const updatedNomorRek = nomor_rekening ?? kios.rows[0].nomor_rekening;
  const updatedNamaBank = nama_bank ?? kios.rows[0].nama_bank;

  const result = await pool.query(
    `UPDATE kios 
     SET nama_kios = $1, deskripsi = $2, nomor_rekening = $3, nama_bank = $4, gambar_kios = $5
     WHERE id = $6
     RETURNING *`,
    [updatedNama, updatedDeskripsi, updatedNomorRek, updatedNamaBank, gambarUrl, kiosId]
  );
  return { status: 200, body: result.rows[0] };
}

// Ambil detail kios berdasarkan kios_id (pembeli)
async function getKiosDetailService(req) {
  const kiosId = req.params.id;
  const result = await pool.query(
    `SELECT k.id, k.nama_kios, k.deskripsi, k.gambar_kios
     FROM kios k
     JOIN penjual p ON k.penjual_id = p.id
     WHERE k.id = $1`,
    [kiosId]
  );

  if (result.rowCount === 0) throw httpErr(404, 'Kios tidak ditemukan');

  return {
    status: 200,
    body: { message: 'Detail kios berhasil diambil', data: result.rows[0] }
  };
}

module.exports = {
  createKiosService,
  getKiosHomepageService,
  searchKiosService,
  getAllKiosService,
  getMenusByKiosService,
  getKiosByPenjualService,
  updateKiosService,
  getKiosDetailService,
};
