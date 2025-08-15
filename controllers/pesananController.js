const pool = require('../config/db');
const getGuestId = require('../utils/getGuestId');
const { sendWhatsApp: sendWaMessage } = require('../utils/wa');

//notif ke penjual
const notifyPenjual = async (kiosId, pesananId) => {
  try {
    const kiosData = await pool.query('SELECT penjual_id FROM kios WHERE id = $1', [kiosId]);
    if (kiosData.rows.length === 0) return;

    const penjualId = kiosData.rows[0].penjual_id;
    const penjualData = await pool.query('SELECT no_hp FROM penjual WHERE id = $1', [penjualId]);
    if (penjualData.rows.length === 0) return;

    const noHpPenjual = penjualData.rows[0].no_hp;

    // Ambil pesanan pertama yang statusnya pending atau menunggu diproses
    const firstOrder = await pool.query(
      `SELECT id FROM pesanan
       WHERE EXISTS (SELECT 1 FROM pesanan_detail pd JOIN menu m ON pd.menu_id = m.id WHERE m.kios_id = $1 AND pd.pesanan_id = pesanan.id)
         AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 1`,
      [kiosId]
    );

    const firstPesananId = firstOrder.rows.length > 0 ? firstOrder.rows[0].id : pesananId;

    // Link dashboard penjual + langsung ke detail pesanan pertama
    const linkDashboard = `https://domain.com/dashboard/pesanan/${firstPesananId}`;
    const message = `📢 Pesanan Baru!\nID Pesanan: ${pesananId}\nLihat pesanan: ${linkDashboard}`;

    await sendWaMessage(noHpPenjual, message);
  } catch (err) {
    console.error('Gagal kirim WA ke penjual:', err);
  }
};

//buat pesanan
const buatPesanan = async (req, res) => {
  const guest_id = req.body.guest_id || getGuestId(req);
  const { tipe_pengantaran, nama_pemesan, no_hp, catatan = '', diantar_ke } = req.body;

  if (!guest_id || !tipe_pengantaran || !nama_pemesan || !no_hp) {
    return res.status(400).json({ message: 'guest_id, tipe_pengantaran, nama_pemesan, no_hp wajib diisi' });
  }

  if (tipe_pengantaran === 'diantar' && (!diantar_ke || diantar_ke.trim() === '')) {
    return res.status(400).json({ message: 'diantar_ke wajib diisi jika tipe_pengantaran = diantar' });
  }

  try {
    const k = await pool.query(`
      SELECT k.id AS keranjang_id, k.menu_id, k.jumlah, m.nama_menu, m.harga, m.foto_menu, m.kios_id, ki.nama_kios, m.estimasi_menit
      FROM keranjang k
      JOIN menu m ON k.menu_id = m.id
      LEFT JOIN kios ki ON m.kios_id = ki.id
      WHERE k.guest_id = $1
    `, [guest_id]);

    if (k.rows.length === 0) return res.status(400).json({ message: 'Keranjang kosong' });

    const items = k.rows;
    const total_harga = items.reduce((s, it) => s + Number(it.harga) * Number(it.jumlah), 0);
    const total_estimasi = items.reduce((s, it) => s + (it.estimasi_menit || 10) * Number(it.jumlah), 0);

    // Buat pesanan dengan status 'pending' dulu
  const pesananRes = await pool.query(`
  INSERT INTO pesanan (guest_id, tipe_pengantaran, nama_pemesan, no_hp, catatan, diantar_ke, total_harga, status, total_estimasi)
  VALUES ($1,$2,$3,$4,$5,$6,$7, 'pending', $8) RETURNING *
`, [guest_id, tipe_pengantaran, nama_pemesan, no_hp, catatan, diantar_ke || null, total_harga, total_estimasi]);


    const pesanan = pesananRes.rows[0];
    const pesananId = pesanan.id;

    // Simpan detail pesanan
    const insertDetailText = `
      INSERT INTO pesanan_detail (pesanan_id, menu_id, nama_menu, harga, foto_menu, jumlah, subtotal)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `;
    for (const it of items) {
      await pool.query(insertDetailText, [
        pesananId,
        it.menu_id,
        it.nama_menu,
        it.harga,
        it.foto_menu,
        it.jumlah,
        Number(it.harga) * Number(it.jumlah)
      ]);
    }

    // Hapus keranjang
    await pool.query('DELETE FROM keranjang WHERE guest_id = $1', [guest_id]);

    res.status(201).json({
      message: 'Pesanan berhasil dibuat',
      pesanan
    });

  } catch (err) {
    console.error('buatPesanan error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};


// ambil daftar pesanan berdasarkan guest_id
const getPesananByGuest = async (req, res) => {
  const guest_id = req.query.guest_id || getGuestId(req);
  if (!guest_id) return res.status(400).json({ message: 'guest_id wajib diisi (query/header/body)' });

  try {
    const result = await pool.query(`
      SELECT id, tipe_pengantaran, nama_pemesan, no_hp, catatan, diantar_ke, total_harga, total_estimasi, status, created_at
      FROM pesanan
      WHERE guest_id = $1
      ORDER BY created_at DESC
    `, [guest_id]);

    res.json(result.rows);
  } catch (err) {
    console.error('getPesananByGuest error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};


// ambil detail pesanan by id
const getDetailPesanan = async (req, res) => {
  const pesananId = req.params.id;
  try {
    const p = await pool.query('SELECT * FROM pesanan WHERE id = $1', [pesananId]);
    if (p.rows.length === 0) return res.status(404).json({ message: 'Pesanan tidak ditemukan' });

    const details = await pool.query('SELECT * FROM pesanan_detail WHERE pesanan_id = $1', [pesananId]);
    res.json({ ...p.rows[0], items: details.rows });
  } catch (err) {
    console.error('getDetailPesanan error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

//ambil data pesanan sesuai urutan yang pertama bayar
function formatTanggal(date) {
  if (!date) return null;
  const options = { day: '2-digit', month: 'long', year: 'numeric' };
  const timeOptions = { hour: '2-digit', minute: '2-digit' };
  const tanggal = date.toLocaleDateString('id-ID', options);
  const waktu = date.toLocaleTimeString('id-ID', timeOptions);
  return `${tanggal} pukul ${waktu}`;
}

const getPesananMasuk = async (req, res) => {
  const penjualId = req.user.id;

  try {
    const result = await pool.query(`
      SELECT p.id, p.nama_pemesan, p.no_hp, p.total_harga, p.status,
             p.payment_type, p.tipe_pengantaran, p.diantar_ke,
             p.paid_at,
             ROW_NUMBER() OVER (ORDER BY p.paid_at ASC) AS nomor_antrian
      FROM pesanan p
      JOIN pesanan_detail pd ON pd.pesanan_id = p.id
      JOIN menu m ON pd.menu_id = m.id
      JOIN kios k ON m.kios_id = k.id
      WHERE k.penjual_id = $1 
        AND p.status = 'paid'
      GROUP BY p.id
      ORDER BY p.paid_at ASC
    `, [penjualId]);

    const formatted = result.rows.map(row => ({
      nomor: row.nomor_antrian,
      tanggal_bayar: formatTanggal(row.paid_at), // Sudah format misal "22 Juli 2025 15:00"
      nama: row.nama_pemesan,
      no_hp: row.no_hp,
      metode_bayar: row.payment_type?.toUpperCase() || 'QRIS',
      tipe_pengantaran: row.tipe_pengantaran === 'meja'
        ? `Meja ${row.diantar_ke}`
        : 'Ambil Sendiri',
      total_harga: row.total_harga,
      status: 'Sudah bayar'
    }));

    res.json(formatted);
  } catch (err) {
    console.error("getPesananMasuk error:", err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Mapping status
function getStatusLabel(tipe_pengantaran, statusDb) {
  const mapping = {
    ambil_sendiri: {
      paid: "Menunggu Diproses",
      processing: "Pesanan Diproses",
      ready: "Siap Diambil",
      done: "Selesai"
    },
    diantar: {
      paid: "Menunggu Diproses",
      processing: "Pesanan Diproses",
      delivering: "Pesanan Diantar",
      done: "Selesai"
    }
  };

  const key = tipe_pengantaran === 'diantar' ? 'diantar' : 'ambil_sendiri';
  return mapping[key][statusDb] || statusDb;
}

// GET DETAIL PESANAN
const getDetailPesananMasuk = async (req, res) => {
  try {
    const { id } = req.params;

    // Ambil data pesanan
    const pesanan = await pool.query(
      `SELECT * FROM pesanan WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (pesanan.rows.length === 0) {
      return res.status(404).json({ message: "Pesanan tidak ditemukan" });
    }

    const p = pesanan.rows[0];

    // Ambil menu dari pesanan_detail
    const detailMenu = await pool.query(
      `SELECT m.nama_menu, pd.jumlah, pd.harga
       FROM pesanan_detail pd
       JOIN menu m ON m.id = pd.menu_id
       WHERE pd.pesanan_id = $1`,
      [id]
    );

    // Format response
    const data = {
      id: p.id,
      status_label: getStatusLabel(p.tipe_pengantaran, p.status),
      nama: p.nama,
      no_hp: p.no_hp,
      metode_bayar: p.payment_type?.toUpperCase() || 'QRIS',
      tipe_pengantaran: p.tipe_pengantaran === 'diantar' 
        ? 'Diantar' 
        : 'Ambil Sendiri',
      tanggal_bayar: formatTanggal(p.paid_at),
      catatan: p.catatan,
      total_harga: p.total_harga,
      status: p.status,
      menu: detailMenu.rows
    };

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal mengambil detail pesanan" });
  }
};

//update status pesanan 
const updateStatusPesanan = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowedStatuses = ['pending', 'paid', 'processing', 'ready', 'delivering', 'done'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: 'Status tidak valid' });
  }

  try {
    const result = await pool.query(
      `UPDATE pesanan SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
    }

    res.json({ message: 'Status berhasil diperbarui', pesanan: result.rows[0] });
  } catch (err) {
    console.error('updateStatusPesanan error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};


module.exports = 
{ buatPesanan, 
  getPesananByGuest, 
  getDetailPesanan, 
  getPesananMasuk, 
  notifyPenjual,
  getStatusLabel,
  getDetailPesananMasuk,
  updateStatusPesanan
};
