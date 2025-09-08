// controllers/pesananController.js (thin controller)
const {
  // helpers
  getStatusLabel,
  // notifications
  notifyPenjualService,
  notifyPembeliPesananSelesaiService,
  // endpoints
  buatPesananService,
  getPesananByGuestService,
  getDetailPesananService,
  getPesananMasukService,
  getDetailPesananMasukService,
  countPesananMasukService,
  updateStatusPesananService,
  getRiwayatPesananService,
  getDetailRiwayatPesananService,
  getStatusPesananGuestService,
} = require('../services/pesananService');

// Notifikasi ke penjual (dipanggil modul lain, jaga nama/kontrak)
const notifyPenjual = async (kiosId, pesananId) => {
  return notifyPenjualService(kiosId, pesananId);
};

// Notifikasi ke pembeli (dipanggil internal)
const notifyPembeliPesananSelesai = async (pesananId) => {
  return notifyPembeliPesananSelesaiService(pesananId);
};

// helper yang diexport dengan nama sama
module.exports.getStatusLabel = getStatusLabel;

// === Endpoints ===
const buatPesanan = async (req, res) => {
  try {
    const { status, body } = await buatPesananService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    return res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

const getStatusPesananGuest = async (req, res) => {
  try {
    const { status, body } = await getStatusPesananGuestService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error("getStatusPesananGuest error:", err);
    return res.status(500).json({ message: "Gagal mengambil status pesanan" });
  }
};

const getPesananByGuest = async (req, res) => {
  try {
    const { status, body } = await getPesananByGuestService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('getPesananByGuest error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

const getDetailPesanan = async (req, res) => {
  try {
    const { status, body } = await getDetailPesananService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('getDetailPesanan error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

const getPesananMasuk = async (req, res) => {
  try {
    const { status, body } = await getPesananMasukService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error("getPesananMasuk error:", err);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const getDetailPesananMasuk = async (req, res) => {
  try {
    const { status, body } = await getDetailPesananMasukService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('getDetailPesananMasuk error:', err);
    return res.status(500).json({ message: "Gagal mengambil detail pesanan" });
  }
};

const countPesananMasuk = async (req, res) => {
  try {
    const { status, body } = await countPesananMasukService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error("countPesananMasuk error:", err);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const updateStatusPesanan = async (req, res) => {
  try {
    const { status, body } = await updateStatusPesananService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('updateStatusPesanan error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

const getRiwayatPesanan = async (req, res) => {
  try {
    const { status, body } = await getRiwayatPesananService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('getRiwayatPesanan error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

const getDetailRiwayatPesanan = async (req, res) => {
  try {
    const { status, body } = await getDetailRiwayatPesananService(req);
    return res.status(status).json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error("getDetailRiwayatPesanan error:", err);
    return res.status(500).json({ message: "Gagal mengambil detail riwayat pesanan" });
  }
};

module.exports = {
  // endpoints
  buatPesanan,
  getPesananByGuest,
  getDetailPesanan,
  getPesananMasuk,
  getDetailPesananMasuk,
  updateStatusPesanan,
  getRiwayatPesanan,
  countPesananMasuk,
  getDetailRiwayatPesanan,
  getStatusPesananGuest,
  // helpers/notifications (dipakai modul lain)
  notifyPenjual,
  notifyPembeliPesananSelesai,
  getStatusLabel,
};
