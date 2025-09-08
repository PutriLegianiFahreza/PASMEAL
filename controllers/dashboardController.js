const { getDashboardDataService, getStatusLabel } = require('../services/dashboardService');

const getDashboardData = async (req, res) => {
  try {
    const { kios_id, id: penjual_id } = req.user;
    const result = await getDashboardDataService({ kios_id, penjual_id });
    return res.json(result);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Gagal mengambil data dashboard' });
  }
};

module.exports = {
  getDashboardData,
  getStatusLabel,
};
