const pool = require('../config/db');
const crypto = require('crypto');
const getGuestId = require('../utils/getGuestId');
const { sendWhatsApp: sendWaMessage } = require('../utils/wa');

// Notifikasi ke penjual dengan token sementara
const notifyPenjual = async (kiosId, pesananId) => {
  try {
    // Ambil penjual_id dari kios
    const kiosData = await pool.query(
      'SELECT penjual_id FROM kios WHERE id = $1',
      [kiosId]
    );
    if (kiosData.rows.length === 0) return;

    const penjualId = kiosData.rows[0].penjual_id;

    // Ambil nomor HP penjual
    const penjualData = await pool.query(
      'SELECT no_hp FROM penjual WHERE id = $1',
      [penjualId]
    );
    if (penjualData.rows.length === 0) return;

    const noHpPenjual = penjualData.rows[0].no_hp;

    // Generate token sementara (misal berlaku 30 menit)
    const token = crypto.randomBytes(16).toString('hex');

    // Simpan token + kiosId + pesananId di tabel sementara
    await pool.query(
      `INSERT INTO kios_tokens (kios_id, pesanan_id, token, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '30 minutes')`,
      [kiosId, pesananId, token]
    );

    // Link frontend langsung ke detail pesanan dengan token
    const linkDashboard = `https://pas-meal.vercel.app/OrderPage?kiosId=${kiosId}&token=${token}`;

    const message = `📢 Pesanan Baru!
ID Pesanan: ${pesananId}
Lihat pesanan: ${linkDashboard}`;

    await sendWaMessage(noHpPenjual, message);
    console.log(`WA notifikasi pesanan ke penjual (${noHpPenjual}) terkirim.`);

  } catch (err) {
    console.error('Gagal kirim WA ke penjual:', err);
  }
};

// Verifikasi token sementara penjual & ambil data pesanan
const verifyTokenKios = async (req, res) => {
  const { kiosId, token } = req.query;

  if (!kiosId || !token) {
    return res.status(400).json({ message: 'kiosId dan token wajib diisi' });
  }

  try {
    // Cek token di tabel kios_tokens
    const tokenRes = await pool.query(
      `SELECT * FROM kios_tokens 
       WHERE kios_id = $1 AND token = $2 AND expires_at > NOW()`,
      [kiosId, token]
    );

    if (tokenRes.rows.length === 0) {
      return res.status(401).json({ message: 'Token tidak valid atau sudah kadaluarsa' });
    }

    // Ambil pesanan terkait kios
    const pesananRes = await pool.query(
      `SELECT p.id, p.nama_pemesan, p.no_hp, p.total_harga, p.status, p.tipe_pengantaran, p.diantar_ke
       FROM pesanan p
       JOIN pesanan_detail pd ON pd.pesanan_id = p.id
       JOIN menu m ON pd.menu_id = m.id
       WHERE m.kios_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [kiosId]
    );

    res.json({
      message: 'Token valid',
      pesanan: pesananRes.rows
    });

  } catch (err) {
    console.error('verifyTokenKios error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// Notifikasi ke pembeli setelah pesanan selesai
const notifyPembeliPesananSelesai = async (pesananId) => {
  try {
    // Ambil data pesanan
    const pesananRes = await pool.query(
      `SELECT nama_pemesan, no_hp, total_harga, tipe_pengantaran, diantar_ke
       FROM pesanan 
       WHERE id = $1`,
      [pesananId]
    );
    if (pesananRes.rows.length === 0) return;

    const pesanan = pesananRes.rows[0];
    const noHpPembeli = pesanan.no_hp;
    const namaPembeli = pesanan.nama_pemesan;

    // Ambil detail pesanan
    const detailRes = await pool.query(
      `SELECT nama_menu, jumlah, harga
       FROM pesanan_detail
       WHERE pesanan_id = $1`,
      [pesananId]
    );

    const menuList = detailRes.rows
      .map(item => `${item.nama_menu} x${item.jumlah} = Rp${(item.harga * item.jumlah).toLocaleString()}`)
      .join('\n');

    const alamat = pesanan.tipe_pengantaran === 'diantar'
      ? `\nDiantar ke: ${pesanan.diantar_ke}`
      : '\nAmbil sendiri di kantin';

    const message = `
Hai ${namaPembeli}! 🎉
Pesanan kamu dengan ID ${pesananId} sudah selesai dan berhasil diterima.
Berikut detail pesananmu:
${menuList}
Total: Rp${Number(pesanan.total_harga).toLocaleString()}
${alamat}

Terima kasih sudah memesan di kantin Universitas Setiabudi! 😊
Selamat menikmati makanannya!
`;

    await sendWaMessage(noHpPembeli, message);
    console.log(`Notifikasi WA ke pembeli ${namaPembeli} (${noHpPembeli}) berhasil dikirim.`);

  } catch (err) {
    console.error('Gagal kirim WA ke pembeli:', err);
  }
};


//buat pesanan(pembeli)
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

// ambil daftar pesanan berdasarkan guest_id(penjual)
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

// ambil detail pesanan by id(penjual)
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

// ambil daftar pesanan masuk (penjual)
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
      tanggal_bayar: formatTanggal(row.paid_at), 
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

// GET DETAIL PESANAN(penjual)
const getDetailPesananMasuk = async (req, res) => {
  try {
    const { id } = req.params;
    const pesanan = await pool.query(
      `SELECT * FROM pesanan WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (pesanan.rows.length === 0) {
      return res.status(404).json({ message: "Pesanan tidak ditemukan" });
    }

    const p = pesanan.rows[0];

    const detailMenu = await pool.query(
      `SELECT m.nama_menu, pd.jumlah, pd.harga
       FROM pesanan_detail pd
       JOIN menu m ON m.id = pd.menu_id
       WHERE pd.pesanan_id = $1`,
      [id]
    );

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

//update status pesanan(penjual)
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

    const pesanan = result.rows[0];

    if (status === 'done') {
      notifyPembeliPesananSelesai(pesanan.id);
    }

    res.json({ message: 'Status berhasil diperbarui', pesanan });
  } catch (err) {
    console.error('updateStatusPesanan error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

//riwayat pesanan(penjual)
const getRiwayatPesanan = async (req, res) => {
  try {
    const pesananQuery = `
      SELECT p.id, p.nama_pemesan, p.no_hp, 
             CASE WHEN p.tipe_pengantaran = 'diantar' THEN p.diantar_ke ELSE NULL END AS alamat_pengantaran,
             p.payment_type, p.tipe_pengantaran, p.total_harga, p.status,
             TO_CHAR(p.created_at, 'DD Mon YYYY HH24:MI') AS tanggal,
             p.catatan
      FROM pesanan p
      WHERE p.status = 'done'
      ORDER BY p.created_at DESC
    `;

    const pesananResult = await pool.query(pesananQuery);
    console.log('pesananResult.rows:', pesananResult.rows);

    if (pesananResult.rows.length === 0) {
      return res.json({ message: 'Riwayat Pesanan Kosong', data: [] });
    }

    const pesananIds = pesananResult.rows.map(p => p.id);
    const detailQuery = `
      SELECT pd.pesanan_id, pd.nama_menu, pd.jumlah, pd.harga
      FROM pesanan_detail pd
      WHERE pd.pesanan_id = ANY($1::int[])
    `;
    const detailResult = await pool.query(detailQuery, [pesananIds]);
    console.log('detailResult.rows:', detailResult.rows);

    const data = pesananResult.rows.map(pesanan => {
      const detail = detailResult.rows.filter(d => d.pesanan_id === pesanan.id);
      return { ...pesanan, detail };
    });

    res.json({ message: 'Berhasil ambil riwayat pesanan', data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Terjadi kesalahan server', error: error.message });
  }
};

module.exports = 
{ buatPesanan, 
  getPesananByGuest, 
  getDetailPesanan, 
  getPesananMasuk, 
  notifyPenjual,
  verifyTokenKios,
  notifyPembeliPesananSelesai,
  getStatusLabel,
  getDetailPesananMasuk,
  updateStatusPesanan,
  getRiwayatPesanan
};
