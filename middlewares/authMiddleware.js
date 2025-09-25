const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// token blacklist check untuk logout
const isJtiBlacklisted = async (jti) => {
  if (!jti) return false;
  const { rowCount } = await pool.query(
    'SELECT 1 FROM blacklisted_tokens WHERE jti = $1 LIMIT 1',
    [jti]
  );
  return rowCount > 0;
};

const attachKiosId = async (user) => {
  if (!user.kios_id && user.id) {
    const result = await pool.query('SELECT id FROM kios WHERE penjual_id = $1', [user.id]);
    if (result.rowCount > 0) user.kios_id = result.rows[0].id;
  }
  return user;
};

const normalizeUser = (decoded) => ({ ...decoded, id: Number(decoded.id || decoded.penjual_id) });

// token verification middleware (untuk routes yang butuh auth)
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ message: 'Token tidak ditemukan' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      maxAge: '7d',
      clockTolerance: 5,
    });

    if (await isJtiBlacklisted(decoded.jti)) {
      return res.status(403).json({ message: 'Token sudah logout' });
    }

    req.user = await attachKiosId(normalizeUser(decoded));
    next();
  } catch {
    return res.status(403).json({ message: 'Token tidak valid atau kadaluarsa' });
  }
};

//token verification + verified account middleware (untuk routes yang butuh auth + verified)
const verifiedMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ message: 'Token tidak ditemukan' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      maxAge: '7d',
      clockTolerance: 5,
    });

    if (!decoded.is_verified) return res.status(403).json({ message: 'Akun belum diverifikasi' });
    if (await isJtiBlacklisted(decoded.jti)) {
      return res.status(403).json({ message: 'Token sudah logout' });
    }

    req.user = await attachKiosId(normalizeUser(decoded));
    next();
  } catch {
    return res.status(403).json({ message: 'Token tidak valid atau kadaluarsa' });
  }
};

module.exports = { authMiddleware, verifiedMiddleware };
