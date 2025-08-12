const pool = require('../config/db');
const bcrypt = require('bcrypt');
const { sendWhatsAppOTP } = require('../utils/wa');
const { sendWhatsApp } = require('../utils/wa');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// === REGISTER ===
const register = async (req, res) => {
  const { nama, email, no_hp, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Konfirmasi password tidak cocok' });
  }

  try {
    const cek = await pool.query('SELECT * FROM penjual WHERE no_hp = $1', [no_hp]);
    if (cek.rows.length > 0) {
      return res.status(409).json({ message: 'Nomor WhatsApp sudah digunakan' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const kode_otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiredAt = new Date(Date.now() + 5 * 60 * 1000); // 5 menit

    const result = await pool.query(`
      INSERT INTO penjual (nama, email, no_hp, password, is_verified)
      VALUES ($1, $2, $3, $4, FALSE)
      RETURNING id
    `, [nama, email, no_hp, hashedPassword]);

    const penjualId = result.rows[0].id;

    await pool.query(`
      INSERT INTO otp (penjual_id, otp_code, expired_at)
      VALUES ($1, $2, $3)
    `, [penjualId, kode_otp, expiredAt]);

    await sendWhatsAppOTP(no_hp, kode_otp);

    res.status(200).json({ message: 'OTP berhasil dikirim ke WhatsApp' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};


// === VERIFY OTP ===
const verifyOtp = async (req, res) => {
  const { kode_otp } = req.body;

  try {
    const result = await pool.query(`
      SELECT * FROM otp 
      WHERE otp_code = $1 AND expired_at > NOW() AND is_used = FALSE
      ORDER BY expired_at DESC LIMIT 1
    `, [kode_otp]);

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'OTP salah, kadaluarsa, atau sudah digunakan' });
    }

    const otp = result.rows[0];

    // Tandai penjual terverifikasi
    await pool.query(`UPDATE penjual SET is_verified = TRUE WHERE id = $1`, [otp.penjual_id]);
    await pool.query(`UPDATE otp SET is_used = TRUE WHERE id = $1`, [otp.id]);

    // Kirim penjual_id supaya bisa dipakai registrasi kios tanpa login
    res.status(200).json({ 
      message: 'OTP berhasil diverifikasi', 
      penjual_id: otp.penjual_id 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// === resend OTP ===
const resendOtp = async (req, res) => {
  const { no_hp } = req.body;

  try {
    // Cari penjual berdasarkan no_hp
    const result = await pool.query('SELECT * FROM penjual WHERE no_hp = $1', [no_hp]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Akun tidak ditemukan' });
    }

    const penjual = result.rows[0];
    if (penjual.is_verified) {
      return res.status(400).json({ message: 'Akun sudah diverifikasi' });
    }

    // Cek OTP terakhir (belum digunakan)
    const cekOtp = await pool.query(`
      SELECT * FROM otp 
      WHERE penjual_id = $1 AND is_used = FALSE
      ORDER BY expired_at DESC
      LIMIT 1
    `, [penjual.id]);

    if (cekOtp.rows.length > 0) {
      const latestOtp = cekOtp.rows[0];
      const now = new Date();
      const expiredAt = new Date(latestOtp.expired_at);

      console.log('📌 Server time:', now);
      console.log('⏰ OTP expired at:', expiredAt);

      if (expiredAt > now) {
        return res.status(400).json({ message: 'Silakan tunggu hingga OTP sebelumnya kedaluwarsa' });
      }
    }

    // Generate OTP baru
    const kode_otp = Math.floor(100000 + Math.random() * 900000).toString();
    const newExpiredAt = new Date(Date.now() + 5 * 60 * 1000); // 5 menit

    await pool.query(`
      INSERT INTO otp (penjual_id, otp_code, expired_at)
      VALUES ($1, $2, $3)
    `, [penjual.id, kode_otp, newExpiredAt]);

    // Kirim OTP via WhatsApp
    await sendWhatsAppOTP(no_hp, kode_otp);

    res.status(200).json({ message: 'OTP baru telah dikirim' });
  } catch (err) {
    console.error('❌ Error saat resend OTP:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// === LOGIN ===
const login = async (req, res) => {
  const { nama, password, rememberMe } = req.body;

  try {
    const result = await pool.query('SELECT * FROM penjual WHERE nama = $1', [nama]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Nama atau kata sandi salah' });
    }

    const penjual = result.rows[0];

    // Tambahkan: cek apakah sudah verifikasi
    if (!penjual.is_verified) {
      return res.status(403).json({ message: 'Akun belum diverifikasi' });
    }

    const validPassword = await bcrypt.compare(password, penjual.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Nama atau kata sandi salah' });
    }

    const expiresIn = rememberMe ? '7d' : '1h';
    const token = jwt.sign(
      {
        id: penjual.id,
        nama: penjual.nama,
        is_verified: penjual.is_verified
      },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    res.status(200).json({
      message: 'Berhasil login',
      token,
      penjual: {
        id: penjual.id,
        nama: penjual.nama,
        email: penjual.email,
        no_hp: penjual.no_hp
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// === forgot password ===
const forgotPassword = async (req, res) => {
  const { no_hp } = req.body;

  try {
    const user = await pool.query('SELECT * FROM penjual WHERE no_hp = $1', [no_hp]);
    if (user.rowCount === 0) {
      return res.status(404).json({ message: 'No HP tidak ditemukan' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expired_at = new Date(Date.now() + 1000 * 60 * 15); // 15 menit
    const penjualId = user.rows[0].id;

    await pool.query(`
      INSERT INTO password_reset_tokens (penjual_id, token, expired_at)
      VALUES ($1, $2, $3)
    `, [penjualId, token, expired_at]);

    // 4. Buat link reset password
    const resetLink = `https://frontendmu.com/reset-password?token=${token}`;

    // 5. Kirim via WhatsApp
    const message = `🔐 Permintaan reset password diterima.\n\nKlik link berikut untuk mengganti password kamu:\n${resetLink}\n\nLink ini berlaku selama 15 menit.`;
    await sendWhatsApp(no_hp, message);

    console.log(`✅ Link reset password terkirim ke ${no_hp}`);
    res.status(200).json({ message: 'Link reset password telah dikirim via WhatsApp.' });

  } catch (error) {
    console.error('❌ Gagal memproses lupa password:', error);
    res.status(500).json({ message: 'Terjadi kesalahan saat memproses lupa password.' });
  }
};

// == reset password ==
const resetPassword = async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Password tidak cocok' });
  }

  try {
    const tokenData = await pool.query(`
      SELECT * FROM password_reset_tokens
      WHERE token = $1 AND expired_at > NOW()
    `, [token]);

    if (tokenData.rowCount === 0) {
      return res.status(400).json({ message: 'Token tidak valid atau expired' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const penjualId = tokenData.rows[0].penjual_id;

    await pool.query('UPDATE penjual SET password = $1 WHERE id = $2', [hashed, penjualId]);
    await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);

    res.status(200).json({ message: 'Password berhasil direset' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal reset password' });
  }
};

module.exports = {
  register,
  verifyOtp,
  resendOtp,
  login,
  forgotPassword,
  resetPassword
};
