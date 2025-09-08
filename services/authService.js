// services/authService.js
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendWhatsAppOTP, sendWhatsApp } = require('../utils/wa');

// Helper buat lempar error dengan status
const httpErr = (status, message) => {
  const e = new Error(message);
  e.status = status;
  return e;
};

module.exports = {
  // REGISTER PENJUAL
  async register({ nama, email, no_hp, password, confirmPassword }) {
    if (password !== confirmPassword) throw httpErr(400, 'Konfirmasi password tidak cocok');
    if (!password || password.length < 8) throw httpErr(400, 'Password minimal 8 karakter');

    const cek = await pool.query('SELECT 1 FROM penjual WHERE no_hp = $1', [no_hp]);
    if (cek.rows.length > 0) throw httpErr(409, 'Nomor WhatsApp sudah digunakan');

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO penjual (nama, email, no_hp, password, is_verified)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING id, no_hp`,
      [nama, email, no_hp, hashedPassword]
    );

    // (Tetap sesuai behavior lama: kirim JWT 7d walau is_verified=false)
    const token = jwt.sign(
      { id: result.rows[0].id, no_hp: result.rows[0].no_hp, is_verified: false },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return { penjual_id: result.rows[0].id, token };
  },

 // VERIFY OTP (pakai hash)
async verifyOtp({ kode_otp }) {
  // Ambil kandidat OTP yang masih valid & belum dipakai
  const { rows } = await pool.query(`
    SELECT id, penjual_id, otp_code
    FROM otp
    WHERE expired_at > NOW() AND is_used = FALSE
    ORDER BY expired_at DESC
    LIMIT 50
  `);

  // Cari yang hash-nya cocok
  let otp = null;
  for (const row of rows) {
    const ok = await bcrypt.compare(kode_otp, row.otp_code); // otp_code sekarang berisi HASH
    if (ok) { otp = row; break; }
  }

  if (!otp) throw httpErr(400, 'OTP salah, kadaluarsa, atau sudah digunakan');

  await pool.query(`UPDATE penjual SET is_verified = TRUE WHERE id = $1`, [otp.penjual_id]);
  await pool.query(`UPDATE otp SET is_used = TRUE WHERE id = $1`, [otp.id]);

  const token = jwt.sign(
    { penjual_id: otp.penjual_id, is_verified: true },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { penjual_id: otp.penjual_id, token };
},

  // RESEND OTP
  async resendOtp({ no_hp }) {
    const result = await pool.query('SELECT * FROM penjual WHERE no_hp = $1', [no_hp]);
    if (result.rows.length === 0) throw httpErr(404, 'Akun tidak ditemukan');

    const penjual = result.rows[0];
    if (penjual.is_verified) throw httpErr(400, 'Akun sudah diverifikasi');

    // cek OTP terakhir
    const cekOtp = await pool.query(
      `SELECT * FROM otp 
       WHERE penjual_id = $1 AND is_used = FALSE
       ORDER BY expired_at DESC LIMIT 1`,
      [penjual.id]
    );

    if (cekOtp.rows.length > 0) {
      const latestOtp = cekOtp.rows[0];
      const now = new Date();
      const expiredAt = new Date(latestOtp.expired_at);
      if (expiredAt > now) throw httpErr(400, 'Silakan tunggu hingga OTP sebelumnya kedaluwarsa');
    }

    // generate OTP baru
    const kode_otp = Math.floor(100000 + Math.random() * 900000).toString();
    const newExpiredAt = new Date(Date.now() + 3 * 60 * 1000); // 3 menit

    const bcrypt = require('bcrypt');
    const otpHash = await bcrypt.hash(kode_otp, 10);

    await pool.query(
    `INSERT INTO otp (penjual_id, otp_code, expired_at) VALUES ($1, $2, $3)`,
    [penjual.id, otpHash, newExpiredAt]
  );

    await sendWhatsAppOTP(no_hp, kode_otp);
    return true;
  },

  // LOGIN
  async login({ nama, password, rememberMe }) {
    const result = await pool.query('SELECT * FROM penjual WHERE nama = $1', [nama]);
    if (result.rows.length === 0) throw httpErr(401, 'Nama atau kata sandi salah');

    const penjual = result.rows[0];
    if (!penjual.is_verified) throw httpErr(403, 'Akun belum diverifikasi');

    const validPassword = await bcrypt.compare(password, penjual.password);
    if (!validPassword) throw httpErr(401, 'Nama atau kata sandi salah');

    const expiresIn = rememberMe ? '7d' : '1h';
    const token = jwt.sign(
      { id: penjual.id, nama: penjual.nama, is_verified: penjual.is_verified },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    return {
      token,
      penjual: {
        id: penjual.id,
        nama: penjual.nama,
        email: penjual.email,
        no_hp: penjual.no_hp
      }
    };
  },

  // FORGOT PASSWORD
  async forgotPassword({ no_hp }) {
    const user = await pool.query('SELECT * FROM penjual WHERE no_hp = $1', [no_hp]);
    if (user.rowCount === 0) throw httpErr(404, 'Nomor WhatsApp tidak ditemukan');

    const token = crypto.randomBytes(32).toString('hex');
    const expired_at = new Date(Date.now() + 1000 * 60 * 15); // 15 menit
    const penjualId = user.rows[0].id;

    await pool.query(
      `INSERT INTO password_reset_tokens (penjual_id, token, expired_at) VALUES ($1, $2, $3)`,
      [penjualId, token, expired_at]
    );

    const resetLink = `https://pas-meal.vercel.app/NewPassPage?token=${token}`;
    const message = `🔐 Permintaan reset password diterima.\n\nKlik tautan berikut untuk mengganti password kamu:\n${resetLink}\n\ntautan ini berlaku selama 15 menit.`;
    await sendWhatsApp(no_hp, message);

    return true;
  },

  // RESET PASSWORD
  async resetPassword({ token, password, confirmPassword }) {
    if (password !== confirmPassword) throw httpErr(400, 'Password tidak cocok');

    const tokenData = await pool.query(
      `SELECT * FROM password_reset_tokens WHERE token = $1 AND expired_at > NOW()`,
      [token]
    );
    if (tokenData.rowCount === 0) throw httpErr(400, 'Token tidak valid atau expired');

    const hashed = await bcrypt.hash(password, 10);
    const penjualId = tokenData.rows[0].penjual_id;

    await pool.query('UPDATE penjual SET password = $1 WHERE id = $2', [hashed, penjualId]);
    await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);

    return true;
  },

  // LOGOUT
  async logout({ authorization }) {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw httpErr(401, 'Token tidak ditemukan');
    }
    const token = authorization.split(' ')[1];
    // (Tetap pakai decode agar behavior sama; kalau mau lebih aman ganti verify)
    const decoded = jwt.decode(token);
    await pool.query(
      'INSERT INTO blacklisted_tokens (token, expired_at) VALUES ($1, to_timestamp($2))',
      [token, decoded?.exp || Math.floor(Date.now()/1000)]
    );
    return true;
  }
};
