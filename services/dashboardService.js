// services/dashboardService.js
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

async function getDashboardDataService({ kios_id, penjual_id }) {
  // Bangun filter persis seperti versi lama
  let filterClause = '';
  let filterValue = [];

  if (kios_id) {
    filterClause = 'm.kios_id = $1';
    filterValue = [kios_id];
  } else if (penjual_id) {
    filterClause = 'm.penjual_id = $1';
    filterValue = [penjual_id];
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
       JOIN pesanan_detail pd ON pd.pesanan_id = p.id
       JOIN menu m ON pd.menu_id = m.id
       WHERE ${filterClause}
       AND LOWER(p.status) != 'done'`,
      filterValue
    ),
    // Total menu
    pool.query(
      `SELECT COUNT(*) AS total_menu
       FROM menu m
       WHERE ${filterClause}`,
      filterValue
    ),
    // Total pendapatan (hanya pesanan selesai)
    pool.query(
      `SELECT COALESCE(SUM(p.total_harga),0) AS pendapatan
       FROM pesanan p
       WHERE LOWER(p.status) = 'done'
       AND EXISTS (
         SELECT 1 FROM pesanan_detail pd
         JOIN menu m ON pd.menu_id = m.id
         WHERE pd.pesanan_id = p.id
         AND ${filterClause}
       )`,
      filterValue
    )
  ]);

  // Kembalikan shape yang SAMA seperti controller lama
  return {
    totalPesanan: parseInt(totalPesananQuery.rows[0].total_pesanan) || 0,
    totalMenu: parseInt(totalMenuQuery.rows[0].total_menu) || 0,
    pendapatan: parseInt(pendapatanQuery.rows[0].pendapatan) || 0
  };
}

module.exports = {
  getStatusLabel,
  getDashboardDataService,
};
