const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// blacklist token
const isTokenBlacklisted = async (token) => {
  const result = await pool.query(
    'SELECT 1 FROM blacklisted_tokens WHERE token = $1 LIMIT 1',
    [token]
  );
  return result.rowCount > 0;
};

// attach kios_id kalau ada user.id
const attachKiosId = async (user) => {
  if (!user.kios_id && user.id) {
    const result = await pool.query(
      'SELECT id FROM kios WHERE penjual_id = $1',
      [user.id]
    );
    if (result.rowCount > 0) user.kios_id = result.rows[0].id;
  }
  return user;
};

// normalize penjual_id / id
const normalizeUser = (decoded) => {
  return {
    ...decoded,
    id: Number(decoded.id || decoded.penjual_id)
  };
};

// Middleware auth umum
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ message: 'Token tidak ditemukan' });

  const token = authHeader.split(' ')[1];

  try {
    if (await isTokenBlacklisted(token)) return res.status(403).json({ message: 'Token sudah logout' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await attachKiosId(normalizeUser(decoded));
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Token tidak valid atau kadaluarsa' });
  }
};

// Middleware untuk user verified
const verifiedMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ message: 'Token tidak ditemukan' });

  const token = authHeader.split(' ')[1];

  try {
    if (await isTokenBlacklisted(token)) return res.status(403).json({ message: 'Token sudah logout' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.is_verified) return res.status(403).json({ message: 'Akun belum diverifikasi' });

    req.user = await attachKiosId(normalizeUser(decoded));
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Token tidak valid atau kadaluarsa' });
  }
};


module.exports = {
  authMiddleware,
  verifiedMiddleware,
};
