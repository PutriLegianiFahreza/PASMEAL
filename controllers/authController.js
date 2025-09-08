// controllers/authController.js (refactor: thin controller)
const AuthService = require('../services/authService');

// REGISTER PENJUAL
const register = async (req, res) => {
  try {
    const { penjual_id, token } = await AuthService.register(req.body);
    return res.status(201).json({
      message: 'Penjual berhasil didaftarkan',
      penjual_id,
      token
    });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || 'Terjadi kesalahan server' });
  }
};

// VERIFY OTP
const verifyOtp = async (req, res) => {
  try {
    const out = await AuthService.verifyOtp(req.body); // { penjual_id, token }
    return res.status(200).json({
      message: 'OTP berhasil diverifikasi',
      penjual_id: out.penjual_id,
      token: out.token
    });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || 'Terjadi kesalahan server' });
  }
};

// RESEND OTP
const resendOtp = async (req, res) => {
  try {
    await AuthService.resendOtp(req.body);
    return res.status(200).json({ message: 'OTP baru telah dikirim' });
  } catch (err) {
    console.error('Error saat resend OTP:', err);
    return res.status(err.status || 500).json({ message: err.message || 'Terjadi kesalahan server' });
  }
};

// LOGIN
const login = async (req, res) => {
  try {
    const out = await AuthService.login(req.body);
    return res.status(200).json({
      message: 'Berhasil login',
      token: out.token,
      penjual: out.penjual
    });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || 'Terjadi kesalahan server' });
  }
};

// FORGOT PASSWORD
const forgotPassword = async (req, res) => {
  try {
    await AuthService.forgotPassword(req.body);
    return res.status(200).json({ message: 'Tautan reset password telah dikirim ke WhatsApp Anda.' });
  } catch (error) {
    console.error(' Gagal memproses lupa password:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Terjadi kesalahan saat memproses lupa password.' });
  }
};

// RESET PASSWORD
const resetPassword = async (req, res) => {
  try {
    await AuthService.resetPassword(req.body);
    return res.status(200).json({ message: 'Password berhasil direset' });
  } catch (error) {
    console.error(error);
    return res.status(error.status || 500).json({ message: error.message || 'Gagal reset password' });
  }
};

// LOGOUT
const logout = async (req, res) => {
  try {
    await AuthService.logout({ authorization: req.headers.authorization });
    return res.status(200).json({ message: 'Logout berhasil' });
  } catch (err) {
    console.error('Gagal logout:', err);
    return res.status(err.status || 500).json({ message: err.message || 'Terjadi kesalahan server' });
  }
};

module.exports = {
  register,
  verifyOtp,
  resendOtp,
  login,
  forgotPassword,
  resetPassword,
  logout,
};
