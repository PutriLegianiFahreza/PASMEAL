const {
  getAllMenuService,
  addMenuService,
  updateMenuService,
  getMenuByIdService,
  deleteMenuService,
  getMenusPaginatedService,
  getNewMenusService,
  searchMenusService,
  searchMenusByKiosService,
  getMenuByIdForBuyerService,
} = require('../services/menuService');
const fs = require('fs');


// Ambil semua menu (penjual)
const getAllMenu = async (req, res) => {
  try {
    const { status, body } = await getAllMenuService(req);
    return res.status(status).json(body); 
  } catch (error) {
    return res.status(500).json({ message: 'Gagal mengambil menu', error: error.message });
  }
};

// Tambah menu (penjual)
const addMenu = async (req, res) => {
  try {
    const { status, body } = await addMenuService(req);
    return res.status(status).json(body); 
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Terjadi kesalahan server', error: error.message });
  }
};

// Update menu (penjual)
const updateMenu = async (req, res) => {
  try {
    const { status, body } = await updateMenuService(req);
    return res.status(status).json(body); 
  } catch (err) {
    console.error(err);
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    if (err.status) return res.status(err.status).json({ message: err.message });
    return res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// Ambil detail menu (penjual)
const getMenuById = async (req, res) => {
  try {
    const { status, body } = await getMenuByIdService(req);
    return res.status(status).json(body); 
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    return res.status(500).json({ message: 'Gagal mengambil detail menu', error: error.message });
  }
};

// Hapus menu (penjual)
const deleteMenu = async (req, res) => {
  try {
    const { status, body } = await deleteMenuService(req);
    return res.status(status).json(body); 
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    return res.status(500).json({ message: 'Gagal menghapus menu', error: error.message });
  }
};

// Ambil menu dengan pagination (penjual)
const getMenusPaginated = async (req, res) => {
  try {
    const { status, body } = await getMenusPaginatedService(req);
    return res.status(status).json(body); 
  } catch (err) {
    return res.status(500).json({ message: 'Gagal mengambil menu', error: err.message });
  }
};

// Ambil 5 menu terbaru (pembeli) 
const getNewMenus = async (req, res) => {
  try {
    const { status, body } = await getNewMenusService();
    return res.status(status).json(body); 
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Cari menu (pembeli) 
const searchMenus = async (req, res) => {
  try {
    const { status, body } = await searchMenusService(req);
    return res.status(status).json(body); 
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
};

// Cari menu di kios tertentu (pembeli) 
const searchMenusByKios = async (req, res) => {
  try {
    const { status, body } = await searchMenusByKiosService(req);
    return res.status(status).json(body); 
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
};

// Detail menu (pembeli) 
const getMenuByIdForBuyer = async (req, res) => {
  try {
    const { status, body } = await getMenuByIdForBuyerService(req);
    return res.status(status).json(body); 
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
};

module.exports = {
  getAllMenu,
  addMenu,
  updateMenu,
  getMenuById,
  deleteMenu,
  getMenusPaginated,
  getNewMenus,
  searchMenus,
  searchMenusByKios,
  getMenuByIdForBuyer,
};
