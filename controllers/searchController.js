const { searchAllService } = require('../services/searchService');

const searchAll = async (req, res) => {
  try {
    const { status, body } = await searchAllService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('Gagal melakukan pencarian:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

module.exports = { searchAll };
