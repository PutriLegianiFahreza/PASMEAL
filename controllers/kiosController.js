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

// REGISTRASI KIOS (penjual)
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

// HOMEPAGE (8 kios)
const getKiosHomepage = async (req, res) => {
  try {
    const { status, body } = await getKiosHomepageService();
    return res.status(status).json(body); 
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// SEARCH kios
const searchKios = async (req, res) => {
  try {
    const { status, body } = await searchKiosService(req);
    return res.status(status).json(body); 
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ALL kios 
const getAllKios = async (req, res) => {
  try {
    const { status, body } = await getAllKiosService();
    return res.status(status).json(body); 
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// MENUS by kios
const getMenusByKios = async (req, res) => {
  try {
    const { status, body } = await getMenusByKiosService(req.params.id);
    return res.status(status).json(body); 
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};


// PROFILE kios (penjual) 
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

// UPDATE kios (penjual) 
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

// DETAIL kios (pembeli) 
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
  getKiosByPenjual,
  updateKios,
  getKiosDetail,
};
