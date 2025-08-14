const jwt = require('jsonwebtoken');
const pool = require('../config/db'); // biar bisa query ke DB

// Fungsi cek blacklist token
const isTokenBlacklisted = async (token) => {
  const result = await pool.query(
    'SELECT 1 FROM blacklisted_tokens WHERE token = $1 LIMIT 1',
    [token]
  );
  return result.rowCount > 0;
};

// Middleware untuk cek token tanpa harus verified
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token tidak ditemukan' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Cek blacklist
    if (await isTokenBlacklisted(token)) {
      return res.status(403).json({ message: 'Token sudah logout' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Token tidak valid atau kadaluarsa' });
  }
};

// Middleware khusus untuk cek token dan pastikan user sudah verified
const verifiedMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token tidak ditemukan' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Cek blacklist
    if (await isTokenBlacklisted(token)) {
      return res.status(403).json({ message: 'Token sudah logout' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.is_verified) {
      return res.status(403).json({ message: 'Akun belum diverifikasi' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Token tidak valid atau kadaluarsa' });
  }
};

module.exports = { authMiddleware, verifiedMiddleware };
