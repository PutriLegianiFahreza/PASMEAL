// services/penjualService.js
const pool = require('../config/db');

const httpErr = (status, message) => {
  const e = new Error(message);
  e.status = status;
  return e;
};

// Ambil data profil penjual
async function getProfileService(req) {
  const penjualId = req.user?.id;
  if (!penjualId) throw httpErr(401, 'Tidak ada ID penjual');

  const result = await pool.query(
    'SELECT id, nama, no_hp, email FROM penjual WHERE id = $1',
    [penjualId]
  );

  if (result.rowCount === 0) throw httpErr(404, 'Profil tidak ditemukan');

  return { status: 200, body: { data: result.rows[0] } };
}

// Update data profil penjual
async function updateProfilService(req) {
  const penjualId = req.user?.id;
  const { nama, no_hp, email } = req.body;

  if (!penjualId) throw httpErr(401, 'Tidak ada ID penjual');

  const current = await pool.query(
    'SELECT nama, no_hp, email FROM penjual WHERE id = $1',
    [penjualId]
  );
  if (current.rowCount === 0) throw httpErr(404, 'Profil tidak ditemukan');

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

  return { status: 200, body: { message: 'Profil berhasil diperbarui', data: result.rows[0] } };
}

module.exports = {
  getProfileService,
  updateProfilService,
};
