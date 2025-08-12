const pool = require('../config/db');  // koneksi db
const { sendWaMessage } = require('../services/whatsapp');  // fungsi WA notif

const updateStatusPesanan = async (req, res) => {
  const { pesanan_id, status } = req.body;

  if (!pesanan_id || !status) {
    return res.status(400).json({ message: 'pesanan_id dan status wajib diisi' });
  }

  try {
    const updateRes = await pool.query(
      `UPDATE pesanan SET status = $1 WHERE id = $2 RETURNING *`,
      [status, pesanan_id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
    }

    const pesanan = updateRes.rows[0];

    const queueRes = await pool.query(
      `SELECT id, total_estimasi, created_at
       FROM pesanan
       WHERE tipe_pengantaran = $1 AND status IN ('paid','diproses')
       ORDER BY created_at ASC`,
      [pesanan.tipe_pengantaran]
    );

    let totalWaktu = 0;
    const estimasiPesanan = {};
    for (const order of queueRes.rows) {
      totalWaktu += order.total_estimasi;
      estimasiPesanan[order.id] = totalWaktu;
    }

    let message = '';
    if (status === 'diproses') {
      message = `👨‍🍳 Pesanan kamu sedang diproses.\n⏳ Estimasi selesai: ${estimasiPesanan[pesanan_id] || pesanan.total_estimasi} menit.`;
    } else if (status === 'dikirim') {
      message = `🚚 Pesanan kamu sudah dikirim.`;
    } else if (status === 'siap_diambil') {
      message = `📦 Pesanan kamu sudah siap diambil.`;
    } else if (status === 'selesai') {
      message = `✅ Pesanan kamu sudah selesai. Terima kasih!`;
    }

    if (message) {
      await sendWaMessage(pesanan.no_hp, message);
    }

    res.json({ message: 'Status pesanan berhasil diupdate dan pembeli diberi tahu' });
  } catch (err) {
    console.error('updateStatusPesanan error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

module.exports = { updateStatusPesanan };