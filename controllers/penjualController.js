// controllers/penjualController.js (thin controller)
const {
  getProfileService,
  updateProfilService,
} = require('../services/penjualService');

// Ambil data profil penjual
const getProfile = async (req, res) => {
  try {
    const { status, body } = await getProfileService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    return res.status(500).json({ message: 'Gagal mengambil profil' });
  }
};

// Update data profil penjual
const updateProfil = async (req, res) => {
  try {
    const { status, body } = await updateProfilService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    return res.status(500).json({ message: 'Gagal memperbarui profil' });
  }
};

module.exports = { 
  getProfile, 
  updateProfil 
};
