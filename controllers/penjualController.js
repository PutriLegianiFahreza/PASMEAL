const pool = require('../config/db');
const bcrypt = require('bcrypt');
const { sendWhatsApp, sendWhatsAppOTP } = require('../utils/wa');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// get profile
const getProfile = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      'SELECT id, nama, email, no_hp, nama_toko FROM penjual WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Data penjual tidak ditemukan' });
    }

    res.status(200).json({ penjual: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

//forgot password
const forgotPassword = async (req, res) => {
  const { no_hp } = req.body;

  try {
    const user = await pool.query('SELECT * FROM penjual WHERE no_hp = $1', [no_hp]);
    if (user.rows.length === 0) {
      return res.status(404).json({ message: 'Nomor tidak terdaftar' });
    }

    const penjualId = user.rows[0].id;

    // buat token dan expired
    const token = crypto.randomBytes(20).toString('hex');
    const expiredAt = new Date(Date.now() + 15 * 60 * 1000); // 15 menit

    // simpan token
    await pool.query(`
      INSERT INTO reset_password_tokens (penjual_id, token, expired_at)
      VALUES ($1, $2, $3)
    `, [penjualId, token, expiredAt]);

    // kirim link ke WhatsApp
    const link = `https://pasmeal.com/reset-password?token=${token}`;
    await sendWhatsApp(no_hp, `Hai! Klik link berikut untuk mengatur ulang kata sandi akun Pasmeal kamu: ${link} (berlaku 15 menit)`);

    res.json({ message: 'Link reset password telah dikirim via WhatsApp' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

//reset password
const resetPassword = async (req, res) => {
  const { token, passwordBaru, confirmPassword } = req.body;

  if (passwordBaru !== confirmPassword) {
    return res.status(400).json({ message: 'Konfirmasi password tidak cocok' });
  }

  try {
    const result = await pool.query(`
      SELECT * FROM reset_password_tokens
      WHERE token = $1 AND expired_at > NOW() AND is_used = FALSE
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Token tidak valid atau sudah kadaluarsa' });
    }

    const { penjual_id, id } = result.rows[0];

    // hash password baru
    const hashedPassword = await bcrypt.hash(passwordBaru, 10);

    // update password
    await pool.query(`
      UPDATE penjual SET password = $1 WHERE id = $2
    `, [hashedPassword, penjual_id]);

    // tandai token sudah digunakan
    await pool.query(`
      UPDATE reset_password_tokens SET is_used = TRUE WHERE id = $1
    `, [id]);

    res.json({ message: 'Password berhasil direset, silakan login' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// data dashboard

const getDashboardData = async (req, res) => {
  const penjualId = req.user.id;

  try {
    const namaResult = await pool.query(
      'SELECT nama FROM penjual WHERE id = $1',
      [penjualId]
    );
    const nama = namaResult.rows[0]?.nama || 'Penjual';

    const totalPesananResult = await pool.query(
      "SELECT COUNT(*) FROM pesanan WHERE penjual_id = $1 AND status != 'batal'",
      [penjualId]
    );
    const totalPesanan = parseInt(totalPesananResult.rows[0].count) || 0;

    const totalMenuResult = await pool.query(
      "SELECT COUNT(*) FROM menu WHERE penjual_id = $1 AND status = 'aktif'",
      [penjualId]
    );
    const totalMenu = parseInt(totalMenuResult.rows[0].count) || 0;

    const pendapatanResult = await pool.query(
      "SELECT SUM(total_harga) FROM pesanan WHERE penjual_id = $1 AND status = 'selesai'",
      [penjualId]
    );
    const pendapatan = parseInt(pendapatanResult.rows[0].sum) || 0;

    res.json({
      nama,
      totalPesanan,
      totalMenu,
      pendapatan
    });
  } catch (error) {
    console.error('Gagal ambil data dashboard:', error);
    res.status(500).json({ message: 'Gagal mengambil data dashboard' });
  }
};

module.exports = {
  getProfile,
  forgotPassword,
  resetPassword, 
  getDashboardData,
};
