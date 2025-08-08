const pool = require('../config/db');

const getDashboardPenjual = async (req, res) => {
  const penjualId = req.user.id;

  try {
    // Hitung total pesanan
    const pesananRes = await pool.query(`
      SELECT COUNT(*) FROM pesanan
      WHERE penjual_id = $1
    `, [penjualId]);

    // Hitung total menu
    const menuRes = await pool.query(`
      SELECT COUNT(*) FROM menu
      WHERE penjual_id = $1
    `, [penjualId]);

    // Hitung total pendapatan (misal total harga dari pesanan yang sudah selesai)
    const pendapatanRes = await pool.query(`
      SELECT COALESCE(SUM(total_harga), 0) FROM pesanan
      WHERE penjual_id = $1 AND status = 'selesai'
    `, [penjualId]);

    res.json({
      totalPesanan: parseInt(pesananRes.rows[0].count),
      totalMenu: parseInt(menuRes.rows[0].count),
      totalPendapatan: parseInt(pendapatanRes.rows[0].coalesce),
    });
  } catch (err) {
    console.error('Gagal mengambil data dashboard:', err);
    res.status(500).json({ message: 'Terjadi kesalahan saat mengambil data dashboard' });
  }
};

module.exports = { getDashboardPenjual };
