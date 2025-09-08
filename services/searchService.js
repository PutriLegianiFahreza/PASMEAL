// services/searchService.js
const pool = require('../config/db');

const httpErr = (status, message) => {
  const e = new Error(message);
  e.status = status;
  return e;
};

async function searchAllService(req) {
  const { query } = req.query;
  if (!query) throw httpErr(400, 'Query pencarian wajib diisi');

  try {
    const kiosResult = await pool.query(
      'SELECT * FROM kios WHERE nama_kios ILIKE $1 ORDER BY id DESC',
      [`%${query}%`]
    );

    const menuResult = await pool.query(
      `SELECT m.*, k.id AS kios_id, k.nama_kios 
       FROM menu m
       JOIN kios k ON m.kios_id = k.id
       WHERE m.nama_menu ILIKE $1
       ORDER BY m.id DESC`,
      [`%${query}%`]
    );

    return { status: 200, body: { kios: kiosResult.rows, menus: menuResult.rows } };
  } catch (err) {
    // biar controller tetap kirim 500 seperti sebelumnya
    // eslint-disable-next-line no-console
    console.error('Gagal melakukan pencarian:', err);
    throw httpErr(500, 'Terjadi kesalahan server');
  }
}

module.exports = { searchAllService };
