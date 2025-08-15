const pool = require('../config/db');

const getDashboardData = async (req, res) => {
    try {
        const { kios_id, id: penjual_id } = req.user; // dari token JWT
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
            pool.query(
                `SELECT COUNT(DISTINCT p.id) AS total_pesanan
                 FROM pesanan p
                 LEFT JOIN pesanan_detail pd ON pd.pesanan_id = p.id
                 LEFT JOIN menu m ON pd.menu_id = m.id
                 ${whereClause}`,
                filters
            ),
            pool.query(
                `SELECT COUNT(*) AS total_menu
                 FROM menu m
                 ${whereClause}`,
                filters
            ),
            pool.query(
                `SELECT COALESCE(SUM(p.total_harga),0) AS pendapatan
                 FROM pesanan p
                 LEFT JOIN pesanan_detail pd ON pd.pesanan_id = p.id
                 LEFT JOIN menu m ON pd.menu_id = m.id
                 ${whereClause ? whereClause + ' AND' : 'WHERE'} p.status IN ($${filters.length + 1}, $${filters.length + 2})`,
                [...filters, 'paid', 'selesai']
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
