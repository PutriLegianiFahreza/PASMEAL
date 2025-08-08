const pool = require('../config/db');
const { sendWhatsApp } = require('../utils/wa');

// Buat pesanan
const createPesanan = async (req, res) => {
  try {
    const {
      nama,
      nomor_telepon,
      nomor_meja,
      metode_pengantaran, // 'antar' atau 'ambil'
      rincian_pesanan,
      total,
      catatan,
      metode_pembayaran // 'qris', 'tunai', dll
    } = req.body;

    const status = 'sudah_dibayar'; // karena cuma yg dibayar yg ditampilkan
    const waktu_pesan = new Date();

    const result = await pool.query(
      `INSERT INTO pesanan 
        (nama, nomor_telepon, nomor_meja, metode_pengantaran, rincian_pesanan, total, catatan, metode_pembayaran, status, waktu_pesan) 
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) 
      RETURNING *`,
      [
        nama,
        nomor_telepon,
        nomor_meja,
        metode_pengantaran,
        rincian_pesanan,
        total,
        catatan,
        metode_pembayaran,
        status,
        waktu_pesan
      ]
    );

    const pesanan = result.rows[0];

    // Kirim WA ke penjual
    await kirimNotifikasiWhatsapp(pesanan);

    res.status(201).json({ message: 'Pesanan berhasil dibuat', data: pesanan });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal membuat pesanan' });
  }
};

// Ambil semua pesanan yang status = 'sudah_dibayar'
const getPesananPenjual = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM pesanan WHERE status = 'sudah_dibayar' ORDER BY waktu_pesan ASC`
    );
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil data pesanan' });
  }
};

// Detail pesanan
const getDetailPesanan = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM pesanan WHERE id = $1`, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Gagal ambil detail pesanan' });
  }
};

// Proses pesanan
const prosesPesanan = async (req, res) => {
  try {
    const { id } = req.params;
    const waktu_diproses = new Date();

    const result = await pool.query(
      `UPDATE pesanan SET status = 'diproses', waktu_diproses = $1 WHERE id = $2 RETURNING *`,
      [waktu_diproses, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
    }

    res.status(200).json({ message: 'Pesanan diproses', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Gagal memproses pesanan' });
  }
};

// Tandai pesanan selesai
const selesaikanPesanan = async (req, res) => {
  try {
    const { id } = req.params;
    const waktu_selesai = new Date();

    const result = await pool.query(
      `UPDATE pesanan SET status = 'selesai', waktu_selesai = $1 WHERE id = $2 RETURNING *`,
      [waktu_selesai, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
    }

    res.status(200).json({ message: 'Pesanan selesai', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Gagal menyelesaikan pesanan' });
  }
};

// Kirim WA
const kirimNotifikasiWhatsapp = async (pesanan) => {
  const link = 'https://pasmeal.com/penjual/pesanan';
  const pesan = `📦 *Pesanan Baru Masuk!*\n\nNama: ${pesanan.nama}\nTotal: Rp${pesanan.total}\n\nLihat detail:\n${link}`;
  await sendWhatsApp(process.env.NOMOR_WA_PENJUAL, pesan);
};

module.exports = {
  createPesanan,
  getPesananPenjual,
  getDetailPesanan,
  prosesPesanan,
  selesaikanPesanan
};
