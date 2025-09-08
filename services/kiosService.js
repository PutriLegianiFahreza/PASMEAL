// services/kiosService.js
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
    // cek penjual valid
    const penjual = await pool.query('SELECT * FROM penjual WHERE id = $1', [penjual_id]);
    if (penjual.rows.length === 0) throw httpErr(400, 'Penjual tidak valid');

    const noHp = penjual.rows[0].no_hp;
    if (!noHp) throw httpErr(400, 'Nomor WhatsApp penjual belum terdaftar');

    // cek apakah penjual sudah punya kios
    const cek = await pool.query('SELECT * FROM kios WHERE penjual_id = $1', [penjual_id]);
    if (cek.rows.length > 0) throw httpErr(409, 'Kios sudah terdaftar untuk penjual ini');

    // cek nama kios unik
    const cekNamaKios = await pool.query(
      'SELECT * FROM kios WHERE LOWER(nama_kios) = LOWER($1)',
      [nama_kios]
    );
    if (cekNamaKios.rows.length > 0) throw httpErr(409, 'Nama kios telah digunakan, silakan pilih nama lain');

    // insert kios baru
    const result = await pool.query(
      `INSERT INTO kios (penjual_id, nama_kios, nama_bank, nomor_rekening)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [penjual_id, nama_kios, nama_bank, nomor_rekening]
    );

    // generate OTP (pertahankan behavior lama)
const kode_otp = Math.floor(100000 + Math.random() * 900000).toString();
const expiredAt = new Date(Date.now() + 3 * 60 * 1000); // 3 menit

// hapus OTP aktif sebelumnya
await pool.query(`DELETE FROM otp WHERE penjual_id = $1 AND is_used = FALSE`, [penjual_id]);

// HASH OTP sebelum simpan
const bcrypt = require('bcrypt');
const otpHash = await bcrypt.hash(kode_otp, 10);

await pool.query(
  `INSERT INTO otp (penjual_id, otp_code, expired_at, is_used)
   VALUES ($1, $2, $3, FALSE)`,
  [penjual_id, otpHash, expiredAt] // <— simpan hash ke kolom otp_code
);

// kirim OTP ke WA tetap plaintext (supaya user bisa input)
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
      // duplicate key
      throw httpErr(409, 'Nama kios sudah digunakan');
    }
    // lempar lagi biar controller kirim 500
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
  return { status: 200, body: { message: 'OK', data: result.rows } };
}

// SEARCH KIOS (pembeli)
async function searchKiosService(req) {
  const { query } = req.query;
  if (!query || query.trim() === '') {
    return { status: 200, body: { message: 'OK', data: [] } };
  }
  const result = await pool.query(
    `SELECT id, nama_kios, deskripsi, gambar_kios
     FROM kios
     WHERE LOWER(nama_kios) LIKE LOWER($1)
     ORDER BY id DESC`,
    [`%${query}%`]
  );
  return { status: 200, body: { message: 'OK', data: result.rows } };
}

// Ambil semua kios (pembeli)
async function getAllKiosService() {
  const result = await pool.query(
    `SELECT id, nama_kios, deskripsi, gambar_kios
     FROM kios
     ORDER BY id DESC`
  );
  return { status: 200, body: { message: 'OK', data: result.rows } };
}

// Ambil menu berdasarkan kios (pembeli)
async function getMenusByKiosService(req) {
  const kiosId = req.params.id;
  const result = await pool.query(
    `SELECT id, nama_menu, harga, gambar_menu, deskripsi
     FROM menu
     WHERE kios_id = $1
     ORDER BY id DESC`,
    [kiosId]
  );
  return { status: 200, body: { message: 'OK', data: result.rows } };
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

  // cek kios ada atau tidak
  const kios = await pool.query('SELECT * FROM kios WHERE id = $1', [kiosId]);
  if (kios.rows.length === 0) throw httpErr(404, 'Kios tidak ditemukan');

  let gambarUrl = kios.rows[0].gambar_kios; // fallback gambar lama

  console.log('req.file:', req.file); // debug file upload

  // kalau ada file baru → upload ke cloudinary
  if (req.file) {
    const upload = await cloudinary.uploader.upload(req.file.path, { folder: 'kios' });
    gambarUrl = upload.secure_url;

    // hapus file lokal setelah upload
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Gagal hapus file lokal:', err);
    });
  }

  // gunakan nilai lama jika field tidak dikirim
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

  // FE memang mengharapkan row langsung (versi lama pakai res.json(result.rows[0]))
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
