// controllers/dashboardController.js (versi thin controller)
const { getDashboardDataService, getStatusLabel } = require('../services/dashboardService');

const getDashboardData = async (req, res) => {
  try {
    const { kios_id, id: penjual_id } = req.user;

    // Panggil service → bentuk response TETAP sama
    const result = await getDashboardDataService({ kios_id, penjual_id });
    return res.json(result);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Gagal mengambil data dashboard' });
  }
};

module.exports = {
  getDashboardData,
  // Tetap export nama yang sama agar tidak memutus import yang ada
  getStatusLabel,
};
