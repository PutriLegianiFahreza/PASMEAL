// controllers/keranjangController.js (refactor: thin controller)
const {
  addToKeranjangService,
  getKeranjangService,
  updateKeranjangItemService,
  removeFromKeranjangService,
} = require('../services/keranjangService');

// TAMBAH ITEM KE KERANJANG
const addToKeranjang = async (req, res) => {
  try {
    const { status, body } = await addToKeranjangService(req);
    return res.status(status).json(body);
  } catch (err) {
    // khusus 409 perlu kirim existing_kios_id bila ada
    if (err.status === 409 && err.existing_kios_id) {
      return res.status(409).json({
        message: err.message,
        existing_kios_id: err.existing_kios_id
      });
    }
    console.error('addToKeranjang error:', err);
    return res.status(err.status || 500).json({ message: err.message || 'Terjadi kesalahan server' });
  }
};

// AMBIL KERANJANG
const getKeranjang = async (req, res) => {
  try {
    const { status, headers, body } = await getKeranjangService(req);
    if (headers?.['X-Buyer-Id']) {
      res.setHeader('X-Buyer-Id', headers['X-Buyer-Id']); // tetap kirim header yang sama
    }
    return res.status(status).json(body);
  } catch (err) {
    console.error('getKeranjang error:', err);
    return res.status(err.status || 500).json({ message: err.message || 'Terjadi kesalahan server' });
  }
};

// UPDATE ITEM KERANJANG
const updateKeranjangItem = async (req, res) => {
  try {
    const { status, body } = await updateKeranjangItemService(req);
    return res.status(status).json(body);
  } catch (err) {
    console.error('updateKeranjangItem error:', err);
    return res.status(err.status || 500).json({ message: err.message || 'Terjadi kesalahan server' });
  }
};

// HAPUS ITEM KERANJANG
const removeFromKeranjang = async (req, res) => {
  try {
    const { status, body } = await removeFromKeranjangService(req);
    return res.status(status).json(body);
  } catch (err) {
    console.error('removeFromKeranjang error:', err);
    return res.status(err.status || 500).json({ message: err.message || 'Terjadi kesalahan server' });
  }
};

module.exports = {
  addToKeranjang,
  getKeranjang,
  updateKeranjangItem,
  removeFromKeranjang
};
