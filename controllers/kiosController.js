// controllers/kiosController.js (thin controller)
const {
  createKiosService,
  getKiosHomepageService,
  searchKiosService,
  getAllKiosService,
  getMenusByKiosService,
  getKiosByPenjualService,
  updateKiosService,
  getKiosDetailService,
} = require('../services/kiosService');

// registrasi kios penjual
const createKios = async (req, res) => {
  try {
    const { status, body } = await createKiosService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    return res.status(500).json({ message: 'Terjadi kesalahan saat membuat kios' });
  }
};

// MENAMPILKAN 8 KIOS DI HOMEPAGE (pembeli)
const getKiosHomepage = async (req, res) => {
  try {
    const { status, body } = await getKiosHomepageService();
    return res.status(status).json(body);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// SEARCH KIOS (pembeli)
const searchKios = async (req, res) => {
  try {
    const { status, body } = await searchKiosService(req);
    return res.status(status).json(body);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Ambil semua kios (pembeli)
const getAllKios = async (req, res) => {
  try {
    const { status, body } = await getAllKiosService();
    return res.status(status).json(body);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Ambil menu berdasarkan kios (pembeli)
const getMenusByKios = async (req, res) => {
  try {
    const { status, body } = await getMenusByKiosService(req);
    return res.status(status).json(body);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// profile kios (penjual)
const getKiosByPenjual = async (req, res) => {
  try {
    const { status, body } = await getKiosByPenjualService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    return res.status(500).json({ message: 'Gagal mengambil data kios' });
  }
};

// UPDATE PROFILE KIOS (penjual)
const updateKios = async (req, res) => {
  try {
    const { status, body } = await updateKiosService(req);
    return res.status(status).json(body);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error(error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
};

// Ambil detail kios berdasarkan kios_id (pembeli)
const getKiosDetail = async (req, res) => {
  try {
    const { status, body } = await getKiosDetailService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    return res.status(500).json({ message: 'Gagal mengambil detail kios' });
  }
};

module.exports = { 
  createKios,
  getKiosHomepage,
  searchKios,
  getAllKios,
  getMenusByKios,
  updateKios,
  getKiosByPenjual, 
  getKiosDetail
};
