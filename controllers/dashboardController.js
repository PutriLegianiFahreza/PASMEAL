const pool = require('../config/db');

function getStatusLabel(tipe_pengantaran, statusDb) {
  const mapping = {
    ambil_sendiri: {
      paid: "Menunggu Diproses",
      processing: "Pesanan Diproses",
      ready: "Siap Diambil",
      done: "Selesai"
    },
    diantar: {
      paid: "Menunggu Diproses",
      processing: "Pesanan Diproses",
      delivering: "Pesanan Diantar",
      done: "Selesai"
    }
  };
  const key = tipe_pengantaran === 'diantar' ? 'diantar' : 'ambil_sendiri';
  return mapping[key]?.[statusDb] || statusDb;
}

const getDashboardData = async (req, res) => {
  try {
    const { kios_id, id: penjual_id } = req.user;
    const filters = [];
    let whereClause = '';

    if (kios_id) {
      filters.push(kios_id);
      whereClause = 'WHERE m.kios_id = $1';
    } else if (penjual_id) {
      filters.push(penjual_id);
      whereClause = 'WHERE m.penjual_id = $1';
    }

    const [
      totalPesananQuery,
      totalMenuQuery,
      pendapatanQuery
    ] = await Promise.all([
      // Total pesanan aktif (belum selesai)
      pool.query(
        `SELECT COUNT(DISTINCT p.id) AS total_pesanan
         FROM pesanan p
         LEFT JOIN pesanan_detail pd ON pd.pesanan_id = p.id
         LEFT JOIN menu m ON pd.menu_id = m.id
         ${whereClause ? whereClause + ' AND' : 'WHERE'} LOWER(p.status) != 'done'`,
        filters
      ),
      // Total menu
      pool.query(
        `SELECT COUNT(*) AS total_menu
         FROM menu m
         ${whereClause}`,
        filters
      ),
      // Total pendapatan (hanya pesanan selesai)
      pool.query(
        `SELECT COALESCE(SUM(p.total_harga),0) AS pendapatan
         FROM pesanan p
         LEFT JOIN pesanan_detail pd ON pd.pesanan_id = p.id
         LEFT JOIN menu m ON pd.menu_id = m.id
         ${whereClause ? whereClause + ' AND' : 'WHERE'} LOWER(p.status) = 'done'`,
        filters
      )
    ]);

    res.json({
      totalPesanan: parseInt(totalPesananQuery.rows[0].total_pesanan) || 0,
      totalMenu: parseInt(totalMenuQuery.rows[0].total_menu) || 0,
      pendapatan: parseInt(pendapatanQuery.rows[0].pendapatan) || 0
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil data dashboard' });
  }
};

module.exports = { getDashboardData };

module.exports = { getDashboardData };
