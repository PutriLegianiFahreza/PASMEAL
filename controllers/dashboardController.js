const pool = require('../config/db');

const getDashboardData = async (req, res) => {
    try {
        // Total Pesanan
        const totalPesananQuery = await pool.query(
            'SELECT COUNT(*) AS total_pesanan FROM pesanan'
        );

        // Total Menu
        const totalMenuQuery = await pool.query(
            'SELECT COUNT(*) AS total_menu FROM menu'
        );

        // Pendapatan
        const pendapatanQuery = await pool.query(
            'SELECT COALESCE(SUM(total_harga), 0) AS pendapatan FROM pesanan WHERE status = $1',
            ['Selesai']
        );

        res.json({
            totalPesanan: parseInt(totalPesananQuery.rows[0].total_pesanan),
            totalMenu: parseInt(totalMenuQuery.rows[0].total_menu),
            pendapatan: parseInt(pendapatanQuery.rows[0].pendapatan)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Gagal mengambil data dashboard' });
    }
};

module.exports = { getDashboardData };
