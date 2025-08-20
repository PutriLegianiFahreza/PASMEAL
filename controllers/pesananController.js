const pool = require('../config/db');
const crypto = require('crypto');
const getGuestId = require('../utils/getGuestId');
const { sendWhatsApp: sendWaMessage } = require('../utils/wa');

/**
* Helper function untuk format tanggal ke format Indonesia
* @param {Date} date - Objek tanggal
* @returns {string|null} - Tanggal yang sudah diformat atau null
*/
function formatTanggal(date) {
 if (!date) return null;
 const options = { day: '2-digit', month: 'long', year: 'numeric' };
 const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
 const tanggal = new Date(date).toLocaleDateString('id-ID', options);
 const waktu = new Date(date).toLocaleTimeString('id-ID', timeOptions).replace(/\./g, ':');
 return `${tanggal} ${waktu}`;
}

/**
* Helper function untuk memetakan status dari database ke label yang lebih user-friendly
* @param {string} tipe_pengantaran - Tipe pengantaran ('diantar' atau 'ambil_sendiri')
* @param {string} statusDb - Status dari database
* @returns {string} - Label status yang sesuai
*/
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
 return mapping[key]?.[statusDb] || statusDb;
}


// Notifikasi ke penjual dengan token sementara
const notifyPenjual = async (kiosId, pesananId) => {
 try {
  const kiosData = await pool.query('SELECT penjual_id FROM kios WHERE id = $1', [kiosId]);
  if (kiosData.rows.length === 0) return;
  const penjualId = kiosData.rows[0].penjual_id;

  const penjualData = await pool.query('SELECT no_hp FROM penjual WHERE id = $1', [penjualId]);
  if (penjualData.rows.length === 0) return;
  const noHpPenjual = penjualData.rows[0].no_hp;

  const token = crypto.randomBytes(16).toString('hex');
  await pool.query(
   `INSERT INTO kios_tokens (kios_id, pesanan_id, token, expires_at)
   VALUES ($1, $2, $3, NOW() + INTERVAL '30 minutes')`,
   [kiosId, pesananId, token]
  );

  const linkDashboard = `https://pas-meal.vercel.app/OrderPage?kiosId=${kiosId}&token=${token}`;
  const message = `📢 Pesanan Baru!\nID Pesanan: ${pesananId}\nLihat pesanan: ${linkDashboard}`;

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
  const tokenRes = await pool.query(
   `SELECT * FROM kios_tokens WHERE kios_id = $1 AND token = $2 AND expires_at > NOW()`,
   [kiosId, token]
  );
  if (tokenRes.rows.length === 0) {
   return res.status(401).json({ message: 'Token tidak valid atau sudah kadaluarsa' });
  }

  const pesananRes = await pool.query(
   `SELECT id, kios_id, nama_pemesan, no_hp, total_harga, status, tipe_pengantaran, diantar_ke
   FROM pesanan WHERE kios_id = $1 ORDER BY created_at DESC`,
   [kiosId]
  );
  res.json({ message: 'Token valid', pesanan: pesananRes.rows });
 } catch (err) {
  console.error('verifyTokenKios error:', err);
  res.status(500).json({ message: 'Terjadi kesalahan server' });
 }
};

// Notifikasi ke pembeli setelah pesanan selesai
const notifyPembeliPesananSelesai = async (pesananId) => {
 try {
  const pesananRes = await pool.query(
   `SELECT nama_pemesan, no_hp, total_harga, tipe_pengantaran, diantar_ke FROM pesanan WHERE id = $1`,
   [pesananId]
  );
  if (pesananRes.rows.length === 0) return;
  const pesanan = pesananRes.rows[0];

  const detailRes = await pool.query(
   `SELECT nama_menu, jumlah, harga FROM pesanan_detail WHERE pesanan_id = $1`,
   [pesananId]
  );

  const menuList = detailRes.rows.map(item => `${item.nama_menu} x${item.jumlah} = Rp${(item.harga * item.jumlah).toLocaleString('id-ID')}`).join('\n');
  const alamat = pesanan.tipe_pengantaran === 'diantar' ? `\nDiantar ke: ${pesanan.diantar_ke}` : '\nAmbil sendiri di kantin';

  const message = `Hai ${pesanan.nama_pemesan}! 🎉
Pesanan kamu sudah selesai dan berhasil diterima.
Berikut detail pesananmu:
${menuList}
Total: Rp${Number(pesanan.total_harga).toLocaleString('id-ID')}${alamat}

Terima kasih sudah memesan di kantin Universitas Setiabudi! 😊
Selamat menikmati 🍽️!`;

  await sendWaMessage(pesanan.no_hp, message);
  console.log(`Notifikasi WA ke pembeli ${pesanan.nama_pemesan} (${pesanan.no_hp}) berhasil dikirim.`);
 } catch (err) {
  console.error('Gagal kirim WA ke pembeli:', err);
 }
};

const buatPesanan = async (req, res) => {
  const guest_id = req.body.guest_id || getGuestId(req);
  const { tipe_pengantaran, nama_pemesan, no_hp, catatan = '', diantar_ke } = req.body;

  if (!guest_id || !tipe_pengantaran || !nama_pemesan || !no_hp) {
    return res.status(400).json({ message: 'Data wajib (guest_id, tipe_pengantaran, nama_pemesan, no_hp) tidak lengkap.' });
  }
  if (tipe_pengantaran === 'diantar' && (!diantar_ke || diantar_ke.trim() === '')) {
    return res.status(400).json({ message: 'Alamat pengantaran (diantar_ke) wajib diisi.' });
  }

  const client = await pool.connect();

  try {
    const keranjangRes = await client.query(
      `SELECT k.id AS keranjang_id, k.menu_id, k.jumlah, 
              m.nama_menu, m.harga, m.foto_menu, m.kios_id, m.estimasi_menit
       FROM keranjang k 
       JOIN menu m ON k.menu_id = m.id 
       WHERE k.guest_id = $1`,
      [guest_id]
    );
    if (keranjangRes.rows.length === 0) {
      return res.status(400).json({ message: 'Keranjang kosong' });
    }

    const items = keranjangRes.rows;
    const kios_id = items[0].kios_id;
    if (items.some(item => item.kios_id !== kios_id)) {
      return res.status(400).json({ message: 'Semua item dalam satu pesanan harus dari kios yang sama.' });
    }

    await client.query('BEGIN');

    const total_harga = items.reduce(
      (sum, item) => sum + Number(item.harga) * Number(item.jumlah),
      0
    );

    // ✅ Hitung total estimasi (akumulasi semua item × jumlah)
    const total_estimasi = items.reduce(
      (sum, item) => sum + (Number(item.estimasi_menit) || 0) * Number(item.jumlah),
      0
    );

    const pesananRes = await client.query(
      `INSERT INTO pesanan 
        (guest_id, kios_id, tipe_pengantaran, nama_pemesan, no_hp, catatan, diantar_ke, total_harga, total_estimasi, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending') 
       RETURNING *`,
      [guest_id, kios_id, tipe_pengantaran, nama_pemesan, no_hp, catatan, diantar_ke || null, total_harga, total_estimasi]
    );
    const pesanan = pesananRes.rows[0];

    const insertDetailQuery =
      `INSERT INTO pesanan_detail 
        (pesanan_id, menu_id, nama_menu, harga, foto_menu, jumlah, subtotal) 
       VALUES ($1,$2,$3,$4,$5,$6,$7)`;

    for (const item of items) {
      await client.query(insertDetailQuery, [
        pesanan.id,
        item.menu_id,
        item.nama_menu,
        item.harga,
        item.foto_menu,
        item.jumlah,
        Number(item.harga) * Number(item.jumlah)
      ]);
    }

    await client.query('DELETE FROM keranjang WHERE guest_id = $1', [guest_id]);

    await client.query('COMMIT');

    await notifyPenjual(kios_id, pesanan.id);

    res.status(201).json({ message: 'Pesanan berhasil dibuat', pesanan });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('buatPesanan error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  } finally {
    client.release(); // selalu dilepas
  }
};


// [PEMBELI] Mengambil daftar pesanan berdasarkan guest_id
const getPesananByGuest = async (req, res) => {
 const guest_id = req.query.guest_id || getGuestId(req);
 if (!guest_id) return res.status(400).json({ message: 'guest_id wajib diisi' });

 const page = parseInt(req.query.page) || 1;
 const limit = 5;
 const offset = (page - 1) * limit;

 try {
  const result = await pool.query(
  `SELECT id, kios_id, tipe_pengantaran, nama_pemesan, total_harga, total_estimasi, status, created_at
   FROM pesanan WHERE guest_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
  [guest_id, limit, offset]
);
  const countRes = await pool.query('SELECT COUNT(*) FROM pesanan WHERE guest_id = $1', [guest_id]);
  const total = parseInt(countRes.rows[0].count);
  const totalPages = Math.ceil(total / limit);

  res.json({ page, totalPages, limit, total, data: result.rows });
 } catch (err) {
  console.error('getPesananByGuest error:', err);
  res.status(500).json({ message: 'Terjadi kesalahan server' });
 }
};

// [PEMBELI] Mengambil detail pesanan berdasarkan ID
// ✅ PERBAIKAN: Menambahkan validasi guest_id untuk keamanan
const getDetailPesanan = async (req, res) => {
  const { id } = req.params;
  const guest_id = getGuestId(req);

  if (!guest_id) {
    return res.status(401).json({ message: 'Akses tidak sah' });
  }

 try {
    // Menambahkan "AND guest_id = $2" untuk memastikan user hanya bisa lihat pesanannya sendiri
  const pesananRes = await pool.query(
      'SELECT * FROM pesanan WHERE id = $1 AND guest_id = $2', 
      [id, guest_id]
    );
  
    if (pesananRes.rows.length === 0) {
      return res.status(404).json({ message: 'Pesanan tidak ditemukan atau Anda tidak memiliki akses' });
    }

  const detailsRes = await pool.query('SELECT * FROM pesanan_detail WHERE pesanan_id = $1', [id]);
  res.json({ ...pesananRes.rows[0], items: detailsRes.rows });
 } catch (err) {
  console.error('getDetailPesanan error:', err);
  res.status(500).json({ message: 'Terjadi kesalahan server' });
 }
};

// [PENJUAL] Mengambil daftar pesanan masuk
const getPesananMasuk = async (req, res) => {
 const penjualId = req.user.id;
 const page = parseInt(req.query.page) || 1;
 const limit = 8;
 const offset = (page - 1) * limit;

 try {
  const result = await pool.query(
   `SELECT p.id, p.kios_id, p.nama_pemesan, p.no_hp, p.total_harga, p.status,
       p.payment_type, p.tipe_pengantaran, p.diantar_ke, p.paid_at, p.total_estimasi,
       ROW_NUMBER() OVER (ORDER BY p.paid_at ASC) AS nomor_antrian
   FROM pesanan p
   WHERE p.kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
    AND p.status IN ('paid', 'processing', 'ready', 'delivering')
   ORDER BY p.paid_at ASC LIMIT $2 OFFSET $3`,
   [penjualId, limit, offset]
  );

  const countRes = await pool.query(
   `SELECT COUNT(id) AS total FROM pesanan
   WHERE kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
    AND status IN ('paid', 'processing', 'ready', 'delivering')`,
   [penjualId]
  );

  const total = parseInt(countRes.rows[0].total);
  const totalPages = Math.ceil(total / limit);
    
  const formattedData = result.rows.map(row => ({
  id: row.id,
  nomor_antrian: row.nomor_antrian,
  pesanan_id : row.id,
  kios_id: row.kios_id,
  tanggal_bayar: formatTanggal(row.paid_at),
  nama: row.nama_pemesan,
  no_hp: row.no_hp,
  metode_bayar: row.payment_type?.toUpperCase() || 'QRIS',
  tipe_pengantaran: row.tipe_pengantaran === 'diantar' ? ` ${row.diantar_ke}` : 'Ambil Sendiri',
  total_harga: row.total_harga,
  total_estimasi: row.total_estimasi, // ✅ tambahin ini
  status: getStatusLabel(row.tipe_pengantaran, row.status)
}));

  res.json({ page, totalPages, limit, total, data: formattedData });
 } catch (err) {
  console.error("getPesananMasuk error:", err);
  res.status(500).json({ message: "Terjadi kesalahan server" });
 }
};

// [PENJUAL] Mengambil detail pesanan masuk
const getDetailPesananMasuk = async (req, res) => {
  try {
    // 1. Ambil SEMUA pesanan aktif yang sedang antre, diurutkan dari yang paling dulu
    const pesananAntreanRes = await pool.query(
      `SELECT p.id, p.paid_at, p.total_estimasi, p.status, p.tipe_pengantaran, p.nama_pemesan, 
              p.no_hp, p.payment_type, p.diantar_ke, p.catatan, p.total_harga, p.kios_id
       FROM pesanan p
       WHERE p.kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
         AND p.status IN ('paid', 'processing', 'ready', 'delivering')
       ORDER BY p.paid_at ASC`,
      [req.user.id]
    );
if (pesananAntreanRes.rows.length === 0) {
      return res.status(404).json({ message: "Tidak ada pesanan aktif" });
    }

    // 2. Hitung jadwal mulai dan selesai untuk setiap pesanan dalam antrean
    let waktuSelesaiSebelumnya = null;
    const antreanDenganJadwal = pesananAntreanRes.rows.map((pesanan, index) => {
      const waktuMulaiMillis = (index === 0)
        ? new Date(pesanan.paid_at).getTime()
        : waktuSelesaiSebelumnya;

      const durasiMillis = (pesanan.total_estimasi || 0) * 60 * 1000;
      const waktuSelesaiMillis = waktuMulaiMillis + durasiMillis;

      waktuSelesaiSebelumnya = waktuSelesaiMillis;
return {
        ...pesanan,
        nomor_antrian: index + 1,
        estimasi_mulai_at: new Date(waktuMulaiMillis).toISOString(),
        estimasi_selesai_at: new Date(waktuSelesaiMillis).toISOString(),
      };
    });
// 3. Cari pesanan spesifik yang diminta oleh user berdasarkan ID
    const p = antreanDenganJadwal.find(row => row.id == req.params.id);
    if (!p) {
      return res.status(404).json({ message: "Pesanan tidak ditemukan dalam antrean aktif" });
    }

    // 4. Ambil detail menu untuk pesanan tersebut
    const detailMenuRes = await pool.query(
      `SELECT pd.nama_menu, pd.jumlah, pd.harga FROM pesanan_detail pd WHERE pd.pesanan_id = $1`,
      [req.params.id]
    );

    // 5. Kirim data yang sudah lengkap ke frontend
    const data = {
      id: p.id,
      nomor_antrian: p.nomor_antrian,
      status_label: getStatusLabel(p.tipe_pengantaran, p.status),
      nama: p.nama_pemesan,
      no_hp: p.no_hp,
      metode_bayar: p.payment_type?.toUpperCase() || 'QRIS',
      tipe_pengantaran: p.tipe_pengantaran === 'diantar' ? `${p.diantar_ke}` : 'Ambil Sendiri',
      tanggal_bayar: formatTanggal(p.paid_at),
      paid_at: p.paid_at,
      catatan: p.catatan,
      total_harga: Number(p.total_harga),
      total_estimasi: Number(p.total_estimasi),
      status: p.status,
      menu: detailMenuRes.rows,
      estimasi_mulai_at: p.estimasi_mulai_at,
      estimasi_selesai_at: p.estimasi_selesai_at,
    };

    res.status(200).json(data);
  } catch (err) {
    console.error('getDetailPesananMasuk error:', err);
    res.status(500).json({ message: "Gagal mengambil detail pesanan" });
  }
};


// [PENJUAL] Menghitung jumlah pesanan masuk untuk badge notifikasi
const countPesananMasuk = async (req, res) => {
 try {
  const result = await pool.query(
   `SELECT COUNT(id) AS jumlah FROM pesanan
   WHERE kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
    AND status IN ('paid', 'processing', 'ready', 'delivering')`,
   [req.user.id]
  );
  res.json({ jumlah: parseInt(result.rows[0].jumlah) || 0 });
 } catch (err) {
  console.error("countPesananMasuk error:", err);
  res.status(500).json({ message: "Terjadi kesalahan server" });
 }
};

// [PENJUAL] Memperbarui status pesanan
const updateStatusPesanan = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const penjualId = req.user.id; // Ambil ID penjual dari token
  const allowedStatuses = ['pending', 'paid', 'processing', 'ready', 'delivering', 'done'];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: 'Status tidak valid' });
  }

  try {
    // TAMBAHKAN KONDISI WHERE UNTUK MEMASTIKAN PESANAN INI MILIK PENJUAL YANG LOGIN
    const result = await pool.query(
      `UPDATE pesanan SET status = $1 
       WHERE id = $2 
       AND kios_id IN (SELECT id FROM kios WHERE penjual_id = $3)
       RETURNING *`,
       [status, id, penjualId] // Tambahkan penjualId sebagai parameter
    );

    if (result.rows.length === 0) {
      // Pesan ini bisa berarti pesanan tidak ditemukan ATAU bukan milik penjual ini
      return res.status(404).json({ message: 'Pesanan tidak ditemukan atau Anda tidak memiliki akses' });
    }
    const pesanan = result.rows[0];

    if (status === 'done') {
      await notifyPembeliPesananSelesai(pesanan.id);
    }
    res.json({ message: 'Status berhasil diperbarui', pesanan });
  } catch (err) {
    console.error('updateStatusPesanan error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// [PENJUAL] Mengambil riwayat pesanan yang sudah selesai
const getRiwayatPesanan = async (req, res) => {
 const penjualId = req.user.id;
 const page = parseInt(req.query.page) || 1;
 const limit = 8;
 const offset = (page - 1) * limit;

 try {
  const pesananRes = await pool.query(
   `SELECT id, kios_id, nama_pemesan, total_harga, total_estimasi, status,
       TO_CHAR(created_at, 'DD Mon YYYY, HH24:MI') AS tanggal
   FROM pesanan
   WHERE status = 'done' AND kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
   ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
   [penjualId, limit, offset]
  );
  const countRes = await pool.query(
   `SELECT COUNT(id) AS total FROM pesanan
   WHERE status = 'done' AND kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)`,
   [penjualId]
  );

  const total = parseInt(countRes.rows[0].total);
  const totalPages = Math.ceil(total / limit);

  res.json({ page, totalPages, limit, total, data: pesananRes.rows });
 } catch (err) {
  console.error('getRiwayatPesanan error:', err);
  res.status(500).json({ message: 'Terjadi kesalahan server' });
 }
};

module.exports = {
 buatPesanan,
 getPesananByGuest,
 getDetailPesanan,
 getPesananMasuk,
 notifyPenjual,
 verifyTokenKios,
 notifyPembeliPesananSelesai,
 getStatusLabel,
 getDetailPesananMasuk,
 updateStatusPesanan,
 getRiwayatPesanan,
 countPesananMasuk
};