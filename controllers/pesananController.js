const pool = require('../config/db');
const crypto = require('crypto');
const getGuestId = require('../utils/getGuestId');
const { sendWhatsApp: sendWaMessage } = require('../utils/wa');

function formatTanggal(date) {
 if (!date) return null;
 const options = { day: '2-digit', month: 'long', year: 'numeric' };
 const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
 const tanggal = new Date(date).toLocaleDateString('id-ID', options);
 const waktu = new Date(date).toLocaleTimeString('id-ID', timeOptions).replace(/\./g, ':');
 return `${tanggal} ${waktu}`;
}

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
    // ambil penjual
    const kiosData = await pool.query(
      'SELECT penjual_id FROM kios WHERE id = $1',
      [kiosId]
    );
    if (kiosData.rows.length === 0) return;
    const penjualId = kiosData.rows[0].penjual_id;

    const penjualData = await pool.query(
      'SELECT no_hp FROM penjual WHERE id = $1',
      [penjualId]
    );
    if (penjualData.rows.length === 0) return;
    const noHpPenjual = penjualData.rows[0].no_hp;

    // cek apakah notifikasi untuk pesanan ini sudah ada
    let tokenData = await pool.query(
      'SELECT * FROM auto_login_tokens WHERE pesanan_id = $1',
      [pesananId]
    );

    let token;
    if (tokenData.rows.length === 0) {
      // buat token baru jika belum ada
      token = crypto.randomBytes(16).toString('hex');
      await pool.query(
        `INSERT INTO auto_login_tokens (penjual_id, pesanan_id, token, expired_at, is_used)
         VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes', FALSE)`,
        [penjualId, pesananId, token]
      );
    } else {
      token = tokenData.rows[0].token;
      if (tokenData.rows[0].is_used) {
        console.log(`Notifikasi untuk pesanan ${pesananId} sudah terkirim sebelumnya.`);
        return; // WA sudah dikirim, jangan kirim lagi
      }
    }

    const linkDashboard = `https://pas-meal.vercel.app/OrderPage?token=${token}`;
    const message = `📢 Pesanan Baru!\nID Pesanan: ${pesananId}\nKlik untuk lihat dan kelola: ${linkDashboard}`;

    // kirim WA
    await sendWaMessage(noHpPenjual, message);
    console.log(`WA notifikasi pesanan ke penjual (${noHpPenjual}) terkirim.`);

    // tandai token sebagai sudah dipakai
    await pool.query(
      'UPDATE auto_login_tokens SET is_used = TRUE WHERE pesanan_id = $1',
      [pesananId]
    );

  } catch (err) {
    console.error('Gagal kirim WA ke penjual:', err);
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

//membuat pesanan
const buatPesanan = async (req, res) => {
  const guest_id = req.body.guest_id || getGuestId(req);
  const { tipe_pengantaran, nama_pemesan, no_hp, catatan = '', diantar_ke } = req.body;

  if (!guest_id || !tipe_pengantaran || !nama_pemesan || !no_hp) {
    return res.status(400).json({ message: 'Data wajib tidak lengkap.' });
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
    if (!keranjangRes.rows.length) return res.status(400).json({ message: 'Keranjang kosong' });

    const items = keranjangRes.rows;
    const kios_id = items[0].kios_id;

    await client.query('BEGIN');

    const total_harga = items.reduce((sum, item) => sum + item.harga * item.jumlah, 0);
    const total_estimasi = items.reduce((sum, item) => sum + (item.estimasi_menit || 0) * item.jumlah, 0);
 // Ambil antrean aktif di kios
    const antreanRes = await client.query(
      `SELECT id, status, total_estimasi, estimasi_selesai_at
       FROM pesanan
       WHERE kios_id = $1
         AND status IN ('paid','processing','ready','delivering')
       ORDER BY paid_at ASC`,
      [kios_id]
    );

    // Hitung estimasi mulai & selesai pesanan baru
    let waktuMulai = Date.now();
    if (antreanRes.rows.length) {
      // Ambil estimasi selesai pesanan terakhir
      const lastPesanan = antreanRes.rows[antreanRes.rows.length - 1];
      const lastSelesai = lastPesanan.estimasi_selesai_at 
                          ? new Date(lastPesanan.estimasi_selesai_at).getTime() 
                          : waktuMulai + (lastPesanan.total_estimasi || 0) * 60000;
      waktuMulai = Math.max(waktuMulai, lastSelesai);
        }
    const estimasi_mulai_at = new Date(waktuMulai);
    const estimasi_selesai_at = new Date(waktuMulai + total_estimasi * 60000);

    // Insert pesanan
    const pesananRes = await client.query(
      `INSERT INTO pesanan
       (guest_id, kios_id, tipe_pengantaran, nama_pemesan, no_hp, catatan, diantar_ke,
        total_harga, total_estimasi, estimasi_mulai_at, estimasi_selesai_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending')
       RETURNING *`,
      [guest_id, kios_id, tipe_pengantaran, nama_pemesan, no_hp, catatan, diantar_ke || null,
       total_harga, total_estimasi, estimasi_mulai_at, estimasi_selesai_at]
 );
    const pesanan = pesananRes.rows[0];

    // Insert detail
    const insertDetailQuery = `INSERT INTO pesanan_detail
      (pesanan_id, menu_id, nama_menu, harga, foto_menu, jumlah, subtotal)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`;
    for (const item of items) {
      await client.query(insertDetailQuery, [
        pesanan.id, item.menu_id, item.nama_menu, item.harga, item.foto_menu, item.jumlah, item.harga * item.jumlah
      ]);
    }
await client.query('DELETE FROM keranjang WHERE guest_id = $1', [guest_id]);
    await client.query('COMMIT');

    await notifyPenjual(kios_id, pesanan.id);

    res.status(201).json({
      message: 'Pesanan berhasil dibuat',
      pesanan: {
        ...pesanan,
        estimasi_mulai_at: estimasi_mulai_at.toISOString(),
        estimasi_selesai_at: estimasi_selesai_at.toISOString()
      }
    });
 } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  } finally {
    client.release();
  }
};

//update status pesanan
const getStatusPesananGuest = async (req, res) => {
  try {
    const { id } = req.params;
    const guest_id = getGuestId(req);

    // 1. Cek apakah pesanan milik guest & ambil kios_id + status
    const pesananRes = await pool.query(
      `SELECT kios_id, status 
       FROM pesanan 
       WHERE id = $1 AND guest_id = $2`,
      [id, guest_id]
    );

    if (pesananRes.rows.length === 0) {
      return res.status(404).json({ message: "Pesanan tidak ditemukan" });
    }

    const { kios_id, status } = pesananRes.rows[0];

    // Kalau sudah selesai → langsung return
    if (status === "done") {
      return res.json({
        status,
        estimasi_selesai_at: new Date().toISOString(),
      });
    }

    // 2. Ambil antrean pesanan aktif di kios
    const antreanRes = await pool.query(
      `SELECT id, paid_at, total_estimasi, status, estimasi_mulai_at
       FROM pesanan
       WHERE kios_id = $1
         AND status IN ('paid', 'processing', 'ready', 'delivering')
       ORDER BY paid_at ASC`,
      [kios_id]
    );

    if (antreanRes.rows.length === 0) {
      return res.status(404).json({ message: "Tidak ada antrean aktif" });
    }

    let waktuSelesaiSebelumnya = Date.now();
    let targetPesanan = null;

    antreanRes.rows.forEach((p) => {
      const mulai =
        p.status === "processing"
          ? Date.now()
          : Math.max(
              waktuSelesaiSebelumnya,
              new Date(p.estimasi_mulai_at || p.paid_at).getTime()
            );

      const durasi = Number(p.total_estimasi || 0) * 60000; // menit → ms
      const selesai = mulai + durasi;

      waktuSelesaiSebelumnya = selesai;

      if (p.id == id) {
        targetPesanan = {
          ...p,
          estimasi_selesai_at: new Date(selesai).toISOString(),
        };
      }
    });

    if (!targetPesanan) {
      // Kalau pesanan nggak ketemu di antrean aktif
      return res.json({ status, estimasi_selesai_at: null });
    }

    return res.json({
      status: targetPesanan.status,
      estimasi_selesai_at: targetPesanan.estimasi_selesai_at,
    });
  } catch (err) {
    console.error("getStatusPesananGuest error:", err);
    res.status(500).json({ message: "Gagal mengambil status pesanan" });
  }
};

// Mengambil daftar pesanan berdasarkan guest_id
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

// Mengambil detail pesanan berdasarkan ID
const getDetailPesanan = async (req, res) => {
  const { id } = req.params;
  const guest_id = getGuestId(req);

  if (!guest_id) {
    return res.status(401).json({ message: 'Akses tidak sah' });
  }

  try {
    const pesananRes = await pool.query(
      'SELECT * FROM pesanan WHERE id = $1 AND guest_id = $2',
      [id, guest_id]
    );

    if (pesananRes.rows.length === 0) {
      return res.status(404).json({ message: 'Pesanan tidak ditemukan atau Anda tidak memiliki akses' });
    }

    const pesanan = pesananRes.rows[0];

    // Ambil detail item pesanan
    const detailsRes = await pool.query(
      'SELECT * FROM pesanan_detail WHERE pesanan_id = $1',
      [id]
    );

    const BASE_URL = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    pesanan.items = detailsRes.rows.map(item => ({
      ...item,
      foto_menu: item.foto_menu
        ? `${BASE_URL}/uploads/${item.foto_menu}`
        : null
    }));

    // --- LOGIKA BARU: Ambil antrean di depan pesanan ini ---
    let antrean = [];
    if (pesanan.status !== 'done') {
      const antreanRes = await pool.query(
        `SELECT id, total_estimasi, estimasi_selesai_at
         FROM pesanan
         WHERE kios_id = $1
           AND status IN ('paid', 'processing', 'ready', 'delivering')
           AND paid_at < $2
         ORDER BY paid_at ASC`,
        [pesanan.kios_id, pesanan.paid_at]
      );

      antrean = antreanRes.rows
        .map(p => {
          const sisaWaktuMillis = new Date(p.estimasi_selesai_at).getTime() - Date.now();
          const sisaWaktuMenit = Math.max(0, sisaWaktuMillis / 60000);
          return { id: p.id, sisaWaktu: sisaWaktuMenit };
        })
        .filter(p => p.sisaWaktu > 0);
    }

    // ✅ Return data pesanan + items + antrean
    res.json({ ...pesanan, antrean });

  } catch (err) {
    console.error('getDetailPesanan error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// Mengambil daftar pesanan masuk
const getPesananMasuk = async (req, res) => {
  try {
    const penjualId = Number(req.user.id || req.user.penjual_id);

    if (isNaN(penjualId)) {
      return res.status(400).json({ message: "User ID tidak valid" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT p.id, p.kios_id, p.nama_pemesan, p.no_hp, p.total_harga, p.status,
              p.payment_type, p.tipe_pengantaran, p.diantar_ke, p.paid_at, p.total_estimasi,
              ROW_NUMBER() OVER (ORDER BY p.paid_at ASC) AS nomor_antrian
       FROM pesanan p
       WHERE p.kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
         AND LOWER(p.status) IN ('paid', 'processing', 'ready', 'delivering')
       ORDER BY p.paid_at ASC
       LIMIT $2 OFFSET $3`,
      [penjualId, limit, offset]
    );

    const countRes = await pool.query(
      `SELECT COUNT(id) AS total FROM pesanan
       WHERE kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
         AND LOWER(status) IN ('paid', 'processing', 'ready', 'delivering')`,
      [penjualId]
    );

    const total = parseInt(countRes.rows[0]?.total || 0);
    const totalPages = Math.ceil(total / limit);

    const formattedData = result.rows.map(row => ({
      id: row.id,
      nomor_antrian: row.nomor_antrian,
      pesanan_id: row.id,
      kios_id: row.kios_id,
      tanggal_bayar: formatTanggal(row.paid_at),
      nama: row.nama_pemesan,
      no_hp: row.no_hp,
      metode_bayar: row.payment_type?.toUpperCase() || 'QRIS',
      tipe_pengantaran: row.tipe_pengantaran === 'diantar' ? `${row.diantar_ke}` : 'Ambil Sendiri',
      total_harga: Number(row.total_harga),
      total_estimasi: Number(row.total_estimasi),
      status: getStatusLabel(row.tipe_pengantaran, row.status)
    }));

    res.json({ page, totalPages, limit, total, data: formattedData });
  } catch (err) {
    console.error("getPesananMasuk error:", err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Mengambil detail pesanan masuk
const getDetailPesananMasuk = async (req, res) => {
  try {
    const pesananAntreanRes = await pool.query(
      `SELECT p.id, p.paid_at, p.total_estimasi, p.status, p.tipe_pengantaran, 
              p.nama_pemesan, p.no_hp, p.payment_type, p.diantar_ke, 
              p.catatan, p.total_harga, p.kios_id
       FROM pesanan p
       WHERE p.kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
         AND p.status IN ('paid', 'processing', 'ready', 'delivering')
       ORDER BY p.paid_at ASC`,
      [req.user.id]
    );

    if (pesananAntreanRes.rows.length === 0) {
      return res.status(404).json({ message: "Tidak ada pesanan aktif" });
    }

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

    const p = antreanDenganJadwal.find(row => row.id == req.params.id);
    if (!p) {
      return res.status(404).json({ message: "Pesanan tidak ditemukan dalam antrean aktif" });
    }

    // ✅ Tambahin foto_menu di detail
    const detailMenuRes = await pool.query(
      `SELECT pd.nama_menu, pd.jumlah, pd.harga, pd.foto_menu 
       FROM pesanan_detail pd 
       WHERE pd.pesanan_id = $1`,
      [req.params.id]
    );

    const BASE_URL = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const menu = detailMenuRes.rows.map(item => ({
      ...item,
      foto_menu: item.foto_menu
        ? `${BASE_URL}/uploads/${item.foto_menu}`
        : null
    }));

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
      menu, // ✅ sudah dengan foto_menu lengkap
      estimasi_mulai_at: p.estimasi_mulai_at,
      estimasi_selesai_at: p.estimasi_selesai_at,
    };

    res.status(200).json(data);
  } catch (err) {
    console.error('getDetailPesananMasuk error:', err);
    res.status(500).json({ message: "Gagal mengambil detail pesanan" });
  }
};

// Menghitung jumlah pesanan masuk untuk badge notifikasi
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

// Memperbarui status pesanan
const updateStatusPesanan = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const penjualId = req.user.id; 
  const allowedStatuses = ['pending', 'paid', 'processing', 'ready', 'delivering', 'done'];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: 'Status tidak valid' });
  }

  try {
    const result = await pool.query(
      `UPDATE pesanan SET status = $1 
       WHERE id = $2 
       AND kios_id IN (SELECT id FROM kios WHERE penjual_id = $3)
       RETURNING *`,
       [status, id, penjualId] 
    );
    if (result.rows.length === 0) {
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

// Mengambil riwayat pesanan
const getRiwayatPesanan = async (req, res) => {
  const penjualId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = 8;
  const offset = (page - 1) * limit;

  try {
    const pesananRes = await pool.query(
      `SELECT id, kios_id, nama_pemesan, no_hp, tipe_pengantaran, diantar_ke, payment_type,
              total_harga, total_estimasi, status,
              TO_CHAR(created_at, 'DD Mon YYYY, HH24:MI') AS tanggal
       FROM pesanan
       WHERE status = 'done' 
         AND kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [penjualId, limit, offset]
    );

    const countRes = await pool.query(
      `SELECT COUNT(id) AS total 
       FROM pesanan
       WHERE status = 'done' 
         AND kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)`,
      [penjualId]
    );

    const total = parseInt(countRes.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    const data = pesananRes.rows.map(p => ({
      ...p,
      metode_bayar: p.payment_type ? p.payment_type.toUpperCase() : 'QRIS',
      tipe_pengantaran: p.tipe_pengantaran === 'diantar' ? p.diantar_ke : 'Ambil Sendiri'
    }));

    res.json({ page, totalPages, limit, total, data });
  } catch (err) {
    console.error('getRiwayatPesanan error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// Mengambil detail riwayat pesanan (status = done)
const getDetailRiwayatPesanan = async (req, res) => {
  try {
    const { id } = req.params;
    const penjualId = req.user.id;

    const pesananRes = await pool.query(
      `SELECT p.id, p.paid_at, p.created_at, p.total_estimasi, p.status, p.tipe_pengantaran, p.nama_pemesan, 
              p.no_hp, p.payment_type, p.diantar_ke, p.catatan, p.total_harga, p.kios_id
       FROM pesanan p
       WHERE p.id = $1 
         AND p.status = 'done'
         AND p.kios_id IN (SELECT id FROM kios WHERE penjual_id = $2)`,
      [id, penjualId]
    );

    if (pesananRes.rows.length === 0) {
      return res.status(404).json({ message: "Riwayat pesanan tidak ditemukan atau bukan milik Anda" });
    }

    const pesanan = pesananRes.rows[0];

    const antrianRes = await pool.query(
      `SELECT p.id
       FROM pesanan p
       WHERE p.status = 'done'
         AND p.kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
       ORDER BY p.paid_at ASC`,
      [penjualId]
    );

    const nomor_antrian =
      antrianRes.rows.findIndex((row) => row.id === pesanan.id) + 1;

    const detailMenuRes = await pool.query(
      `SELECT pd.nama_menu, pd.jumlah, pd.harga, pd.subtotal 
       FROM pesanan_detail pd 
       WHERE pd.pesanan_id = $1`,
      [id]
    );

    const data = {
      id: pesanan.id,
      nomor_antrian,
      status_label: getStatusLabel(pesanan.tipe_pengantaran, pesanan.status),
      nama: pesanan.nama_pemesan,
      no_hp: pesanan.no_hp,
      metode_bayar: pesanan.payment_type?.toUpperCase() || "QRIS",
      tipe_pengantaran:
        pesanan.tipe_pengantaran === "diantar"
          ? `${pesanan.diantar_ke}`
          : "Ambil Sendiri",
      tanggal_bayar: formatTanggal(pesanan.paid_at),
      tanggal_selesai: formatTanggal(pesanan.created_at),
      catatan: pesanan.catatan,
      total_harga: Number(pesanan.total_harga),
      total_estimasi: Number(pesanan.total_estimasi),
      status: pesanan.status,
      menu: detailMenuRes.rows,
    };

    res.status(200).json(data);
  } catch (err) {
    console.error("getDetailRiwayatPesanan error:", err);
    res
      .status(500)
      .json({ message: "Gagal mengambil detail riwayat pesanan" });
  }
};

module.exports = {
 buatPesanan,
 getPesananByGuest,
 getDetailPesanan,
 getPesananMasuk,
 notifyPenjual,
 notifyPembeliPesananSelesai,
 getStatusLabel,
 getDetailPesananMasuk,
 updateStatusPesanan,
 getRiwayatPesanan,
 countPesananMasuk,
 getDetailRiwayatPesanan,
 getStatusPesananGuest
};