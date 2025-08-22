const pool = require('../config/db');

// Ambil data profil penjual
const getProfile = async (req, res) => {
  const penjualId = req.user?.id;

  if (!penjualId) {
    return res.status(401).json({ message: 'Tidak ada ID penjual' });
  }

  try {
    const result = await pool.query(
      'SELECT id, nama, no_hp, email FROM penjual WHERE id = $1',
      [penjualId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Profil tidak ditemukan' });
    }

    res.status(200).json({ data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil profil' });
  }
};

// Update data profil penjual
const updateProfil = async (req, res) => {
  const penjualId = req.user?.id;
  const { nama, no_hp, email } = req.body;

  if (!penjualId) {
    return res.status(401).json({ message: 'Tidak ada ID penjual' });
  }

  try {
    const current = await pool.query(
      'SELECT nama, no_hp, email FROM penjual WHERE id = $1',
      [penjualId]
    );

    if (current.rowCount === 0) {
      return res.status(404).json({ message: 'Profil tidak ditemukan' });
    }

    const oldData = current.rows[0];

    const result = await pool.query(
      'UPDATE penjual SET nama = $1, no_hp = $2, email = $3 WHERE id = $4 RETURNING *',
      [
        nama ?? oldData.nama,
        no_hp ?? oldData.no_hp,
        email ?? oldData.email,
        penjualId
      ]
    );

    res.status(200).json({ message: 'Profil berhasil diperbarui', data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal memperbarui profil' });
  }
};

module.exports = { 
  getProfile, 
  updateProfil 
};
