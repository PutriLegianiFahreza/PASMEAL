// services/pesananService.js
const pool = require('../config/db');
const getGuestId = require('../utils/getGuestId');
const { sendWhatsApp: sendWaMessage } = require('../utils/wa');

const CLOUD_NAME = process.env.CLOUD_NAME || '<CLOUD_NAME>';

const httpErr = (status, message) => {
  const e = new Error(message);
  e.status = status;
  return e;
};

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

// --- Notifikasi ke penjual ---
async function notifyPenjualService(kiosId, pesananId) {
  try {
    const cekLog = await pool.query(
      'SELECT 1 FROM wa_notif_logs WHERE pesanan_id = $1 LIMIT 1',
      [pesananId]
    );
    if (cekLog.rows.length) {
      console.log(`Notif pesanan ${pesananId} sudah pernah dikirim, skip.`);
      return;
    }

    const kiosData = await pool.query('SELECT penjual_id FROM kios WHERE id = $1', [kiosId]);
    if (!kiosData.rows.length) return;
    const penjualId = kiosData.rows[0].penjual_id;

    const penjualData = await pool.query('SELECT no_hp FROM penjual WHERE id = $1', [penjualId]);
    if (!penjualData.rows.length) return;
    const noHpPenjual = penjualData.rows[0].no_hp;

    const linkDashboard = `https://pas-meal.vercel.app/`;
    const message = `📢 Pesanan Baru! Silakan klik tautan ini untuk melihat pesanan: ${linkDashboard}`;

    await sendWaMessage(noHpPenjual, message);
    console.log(`WA notifikasi pesanan ${pesananId} ke penjual (${noHpPenjual}) terkirim.`);

    await pool.query('INSERT INTO wa_notif_logs (pesanan_id) VALUES ($1)', [pesananId]);
  } catch (err) {
    console.error('Gagal kirim WA ke penjual:', err);
  }
}

// --- Notifikasi ke pembeli setelah pesanan selesai ---
async function notifyPembeliPesananSelesaiService(pesananId) {
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

    const menuList = detailRes.rows
      .map(item => `${item.nama_menu} x${item.jumlah} = Rp${(item.harga * item.jumlah).toLocaleString('id-ID')}`)
      .join('\n');
    const alamat = pesanan.tipe_pengantaran === 'diantar'
      ? `\nDiantar ke: ${pesanan.diantar_ke}`
      : '\nAmbil sendiri di kantin';

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
}

// --- Membuat pesanan ---
async function buatPesananService(req) {
  const guest_id = req.body.guest_id || getGuestId(req);
  const { tipe_pengantaran, nama_pemesan, no_hp, catatan = '', diantar_ke } = req.body;

  if (!guest_id || !tipe_pengantaran || !nama_pemesan || !no_hp)
    throw httpErr(400, 'Data wajib tidak lengkap.');

  const client = await pool.connect();
  try {
    const keranjangRes = await client.query(
      `SELECT k.id AS keranjang_id, k.menu_id, k.jumlah, 
              m.nama_menu, m.harga, m.foto_menu, m.kios_id, m.estimasi_menit
       FROM keranjang k JOIN menu m ON k.menu_id = m.id 
       WHERE k.guest_id = $1`,
      [guest_id]
    );
    if (!keranjangRes.rows.length) throw httpErr(400, 'Keranjang kosong');

    const items = keranjangRes.rows;
    const kios_id = items[0].kios_id;

    await client.query('BEGIN');

    const total_harga = items.reduce((sum, i) => sum + i.harga * i.jumlah, 0);
    const total_estimasi = items.reduce((sum, i) => sum + (i.estimasi_menit || 0) * i.jumlah, 0);

    // antrean aktif (info—tidak dipakai langsung dalam response)
    await client.query(
      `SELECT id, status, total_estimasi, estimasi_selesai_at 
       FROM pesanan WHERE kios_id=$1 AND status IN ('paid','processing','ready','delivering') 
       ORDER BY paid_at ASC`,
      [kios_id]
    );

    const pesananRes = await client.query(
      `INSERT INTO pesanan (
        guest_id, kios_id, tipe_pengantaran, nama_pemesan, no_hp, catatan, diantar_ke,
        total_harga, total_estimasi, status, estimasi_mulai_at, estimasi_selesai_at, waktu_proses_mulai
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending', NULL, NULL, NULL)
      RETURNING *`,
      [guest_id, kios_id, tipe_pengantaran, nama_pemesan, no_hp, catatan, diantar_ke || null,
        total_harga, total_estimasi]
    );

    const pesanan = pesananRes.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO pesanan_detail (pesanan_id,menu_id,nama_menu,harga,foto_menu,jumlah,subtotal)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [pesanan.id, item.menu_id, item.nama_menu, item.harga, item.foto_menu, item.jumlah, item.harga * item.jumlah]
      );
    }

    await client.query('DELETE FROM keranjang WHERE guest_id=$1', [guest_id]);
    await client.query('COMMIT');

    // fire-and-forget untuk notifikasi
    notifyPenjualService(kios_id, pesanan.id).catch(err => console.error(err));

    return { status: 201, body: { message: 'Pesanan berhasil dibuat', pesanan } };
  } catch (err) {
    await (async () => { try { await client.query('ROLLBACK'); } catch (_) {} })();
    if (err.status) throw err;
    console.error(err);
    throw httpErr(500, 'Terjadi kesalahan server');
  } finally {
    client.release();
  }
}

// --- Status pesanan untuk guest (logic versi lama, style service baru) ---
async function getStatusPesananGuestService(req) {
  const pesananId = parseInt(req.params.id, 10);
  const guest_id = getGuestId(req);
  if (isNaN(pesananId)) throw httpErr(400, 'ID pesanan tidak valid');

  // target
  const tRes = await pool.query(
    `SELECT id, kios_id, status, created_at, paid_at, waktu_proses_mulai,
            COALESCE(total_estimasi,0) AS total_estimasi
     FROM pesanan
     WHERE id = $1 AND guest_id = $2
     LIMIT 1`,
    [pesananId, guest_id]
  );
  if (!tRes.rows.length) throw httpErr(404, 'Pesanan tidak ditemukan');
  const t = tRes.rows[0];

  // antrean aktif
  const qRes = await pool.query(
    `SELECT id,
            COALESCE(waktu_proses_mulai, paid_at, created_at) AS anchor_time,
            waktu_proses_mulai, paid_at, created_at,
            COALESCE(total_estimasi,0) AS total_estimasi
     FROM pesanan
     WHERE kios_id = $1
       AND status IN ('paid','processing','ready','delivering')
     ORDER BY COALESCE(waktu_proses_mulai, paid_at, created_at) ASC, id ASC`,
    [t.kios_id]
  );

  // selipkan kalau belum ada (pending)
  let list = qRes.rows;
  if (!list.some(r => r.id === pesananId)) {
    list = list.concat([{
      id: t.id,
      anchor_time: t.created_at,
      waktu_proses_mulai: t.waktu_proses_mulai,
      paid_at: t.paid_at,
      created_at: t.created_at,
      total_estimasi: t.total_estimasi
    }]);
  }

  if (list.length === 0) {
    return {
      status: 200,
      body: {
        status: t.status,
        estimasi_selesai_at: null,
        remaining_seconds: 0,
        server_time: new Date().toISOString()
      }
    };
  }

  // simulasi kumulatif sederhana (seperti logic lama)
  let prevFinishMs = null;
  let etaMs = null;

  for (const row of list) {
    const anchorMs = row.anchor_time ? new Date(row.anchor_time).getTime() : Date.now();
    const startMs  = row.waktu_proses_mulai
      ? new Date(row.waktu_proses_mulai).getTime()
      : Math.max(prevFinishMs ?? anchorMs, anchorMs);

    const durMs    = Math.max(0, Number(row.total_estimasi) || 0) * 60 * 1000;
    const finishMs = startMs + durMs;

    if (row.id === pesananId) {
      etaMs = finishMs;
      break;
    }
    prevFinishMs = finishMs;
  }

  const estimasi_selesai_at = etaMs ? new Date(etaMs).toISOString() : null;
  const remaining_seconds = etaMs ? Math.max(0, Math.floor((etaMs - Date.now()) / 1000)) : 0;

  return {
    status: 200,
    body: {
      status: t.status,
      // FE lama:
      estimasi_selesai_at,
      // FE countdown:
      remaining_seconds,
      server_time: new Date().toISOString(), // buat sync timer di FE
      // alias opsional:
      eta_at: estimasi_selesai_at
    }
  };
}


// --- Daftar pesanan by guest ---
async function getPesananByGuestService(req) {
  const guest_id = req.query.guest_id || getGuestId(req);
  if (!guest_id) throw httpErr(400, 'guest_id wajib diisi');

  const page = parseInt(req.query.page, 10) || 1;
  const limit = 5;
  const offset = (page - 1) * limit;

  const result = await pool.query(
    `SELECT id, kios_id, tipe_pengantaran, nama_pemesan, total_harga, total_estimasi, status, created_at
     FROM pesanan WHERE guest_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [guest_id, limit, offset]
  );
  const countRes = await pool.query('SELECT COUNT(*) FROM pesanan WHERE guest_id = $1', [guest_id]);
  const total = parseInt(countRes.rows[0].count, 10);
  const totalPages = Math.ceil(total / limit);

  return { status: 200, body: { page, totalPages, limit, total, data: result.rows } };
}

// --- Detail pesanan untuk guest ---
async function getDetailPesananService(req) {
  const { id } = req.params;
  const guest_id = getGuestId(req);
  if (!guest_id) throw httpErr(401, 'Akses tidak sah');

  const pesananRes = await pool.query(
    'SELECT * FROM pesanan WHERE id = $1 AND guest_id = $2',
    [id, guest_id]
  );
  if (pesananRes.rows.length === 0) throw httpErr(404, 'Pesanan tidak ditemukan atau Anda tidak memiliki akses');

  const pesanan = pesananRes.rows[0];

  const detailsRes = await pool.query('SELECT * FROM pesanan_detail WHERE pesanan_id = $1', [id]);

  // (SAMA seperti kode kamu)
  const items = detailsRes.rows.map(item => {
    let imageUrl = null;
    if (item.foto_menu) {
      if (item.foto_menu.startsWith('http')) {
        imageUrl = item.foto_menu;
      } else {
        imageUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${item.foto_menu}`;
      }
    }
    return { ...item, foto_menu: imageUrl };
  });

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

  return { status: 200, body: { ...pesanan, items, antrean } };
}

// --- Pesanan masuk untuk penjual (kalkulasi kumulatif, style baru) ---
async function getPesananMasukService(req) {
  const penjualId = Number(req.user.id || req.user.penjual_id);
  if (isNaN(penjualId)) throw httpErr(400, 'User ID tidak valid');

  const page = parseInt(req.query.page, 10) || 1;
  const limit = 8;
  const offset = (page - 1) * limit;

  // Hitung kumulatif per-kios langsung di SQL
  const rows = (await pool.query(
    `
   WITH aktif AS (
  SELECT
    p.*,
    COALESCE(p.waktu_proses_mulai, p.paid_at, p.created_at) AS anchor_time
  FROM pesanan p
  WHERE p.kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
    AND LOWER(p.status) IN ('paid','processing','ready','delivering')
),
urut AS (
  SELECT
    a.*,
    ROW_NUMBER() OVER (
      PARTITION BY a.kios_id
      ORDER BY a.anchor_time ASC, a.id ASC
    ) AS nomor_antrian_kios,

    -- kumulasi total_estimasi (menit) per kios
    SUM(COALESCE(a.total_estimasi,0)) OVER (
      PARTITION BY a.kios_id
      ORDER BY a.anchor_time ASC, a.id ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cum_estimasi_menit
  FROM aktif a
)
SELECT
  u.id, u.kios_id, u.nama_pemesan, u.no_hp, u.total_harga, u.status,
  u.payment_type, u.tipe_pengantaran, u.diantar_ke,
  u.paid_at, u.created_at, COALESCE(u.total_estimasi,0) AS total_estimasi,
  u.waktu_proses_mulai,
  u.anchor_time,
  u.nomor_antrian_kios,

  -- ✅ pakai INTERVAL * bigint
  (u.anchor_time + (u.cum_estimasi_menit * INTERVAL '1 minute')) AS estimasi_selesai_at_calc,

  GREATEST(
    0,
    EXTRACT(EPOCH FROM ((u.anchor_time + (u.cum_estimasi_menit * INTERVAL '1 minute')) - NOW()))::bigint
  ) / 60 AS eta_menit_kumulatif
FROM urut u
ORDER BY u.kios_id ASC, u.anchor_time ASC, u.id ASC
LIMIT $2 OFFSET $3
    `,
    [penjualId, limit, offset]
  )).rows;

  // total untuk pagination yang akurat
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM pesanan p
     WHERE p.kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
       AND LOWER(p.status) IN ('paid','processing','ready','delivering')`,
    [penjualId]
  );
  const total = countRes.rows[0].total;
  const totalPages = Math.ceil(total / limit);

  const data = rows.map(row => ({
    id: row.id,
    nomor_antrian: row.nomor_antrian_kios, // nomor dalam kios tsb
    pesanan_id: row.id,
    kios_id: row.kios_id,
    tanggal_bayar: formatTanggal(row.paid_at || row.created_at),
    nama: row.nama_pemesan,
    no_hp: row.no_hp,
    metode_bayar: row.payment_type?.toUpperCase() || 'QRIS',
    tipe_pengantaran: row.tipe_pengantaran === 'diantar' ? `${row.diantar_ke}` : 'Ambil Sendiri',
    total_harga: Number(row.total_harga),
    total_estimasi: Number(row.total_estimasi), // durasi order itu sendiri

    // ✅ ini yang dipakai UI untuk “waktu estimasi” kumulatif
    estimasi_selesai_at: row.estimasi_selesai_at_calc
      ? new Date(row.estimasi_selesai_at_calc).toISOString()
      : null,
    eta_menit_kumulatif: Math.ceil(Number(row.eta_menit_kumulatif || 0)),

    status: getStatusLabel(row.tipe_pengantaran, row.status),
  }));

  return { status: 200, body: { page, totalPages, limit, total, data } };
}

// --- Detail pesanan masuk (jadwal kumulatif, style baru) ---
async function getDetailPesananMasukService(req) {
  const pesananAntreanRes = await pool.query(
    `SELECT p.id, p.paid_at, p.created_at, COALESCE(p.total_estimasi,0) AS total_estimasi,
            p.status, p.tipe_pengantaran, p.nama_pemesan, p.no_hp, p.payment_type, p.diantar_ke,
            p.catatan, p.total_harga, p.kios_id, p.waktu_proses_mulai
     FROM pesanan p
     WHERE p.kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
       AND p.status IN ('paid', 'processing', 'ready', 'delivering')
     ORDER BY COALESCE(p.waktu_proses_mulai, p.paid_at, p.created_at) ASC, p.id ASC`,
    [req.user.id]
  );

  if (!pesananAntreanRes.rows.length) throw httpErr(404, 'Tidak ada pesanan aktif');

  let prevFinishMs = null;
  const scheduled = pesananAntreanRes.rows.map((p, idx) => {
    const anchorMs = new Date(p.waktu_proses_mulai || p.paid_at || p.created_at).getTime();
    const startMs  = p.waktu_proses_mulai
      ? new Date(p.waktu_proses_mulai).getTime()
      : Math.max(prevFinishMs ?? anchorMs, anchorMs);
    const durMs    = Math.max(0, Number(p.total_estimasi) || 0) * 60 * 1000;
    const finishMs = startMs + durMs;
    prevFinishMs   = finishMs;

    return {
      ...p,
      nomor_antrian: idx + 1,
      estimasi_mulai_at: new Date(startMs).toISOString(),
      estimasi_selesai_at: new Date(finishMs).toISOString(),
    };
  });

  const p = scheduled.find(row => row.id == req.params.id);
  if (!p) throw httpErr(404, 'Pesanan tidak ditemukan dalam antrean aktif');

  const detailMenuRes = await pool.query(
    `SELECT pd.nama_menu, pd.jumlah, pd.harga, pd.foto_menu
     FROM pesanan_detail pd
     WHERE pd.pesanan_id = $1`,
    [req.params.id]
  );

  const menu = detailMenuRes.rows.map(item => ({
    ...item,
    foto_menu: item.foto_menu
      ? `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${item.foto_menu}`
      : null
  }));

  return {
    status: 200,
    body: {
      id: p.id,
      nomor_antrian: p.nomor_antrian,
      status_label: getStatusLabel(p.tipe_pengantaran, p.status),
      nama: p.nama_pemesan,
      no_hp: p.no_hp,
      metode_bayar: p.payment_type?.toUpperCase() || 'QRIS',
      tipe_pengantaran: p.tipe_pengantaran === 'diantar' ? `${p.diantar_ke}` : 'Ambil Sendiri',
      tanggal_bayar: formatTanggal(p.paid_at || p.created_at),
      paid_at: p.paid_at,
      catatan: p.catatan,
      total_harga: Number(p.total_harga),
      total_estimasi: Number(p.total_estimasi),
      status: p.status,
      menu,
      estimasi_mulai_at: p.estimasi_mulai_at,
      estimasi_selesai_at: p.estimasi_selesai_at,
    }
  };
}

// --- Badge jumlah pesanan masuk ---
async function countPesananMasukService(req) {
  const result = await pool.query(
    `SELECT COUNT(id) AS jumlah FROM pesanan
     WHERE kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
      AND status IN ('paid', 'processing', 'ready', 'delivering')`,
    [req.user.id]
  );
  return { status: 200, body: { jumlah: parseInt(result.rows[0].jumlah, 10) || 0 } };
}

// --- Update status pesanan ---
async function updateStatusPesananService(req) {
  const { id } = req.params;
  const { status } = req.body;
  const penjualId = req.user.id;
  const allowedStatuses = ['pending', 'paid', 'processing', 'ready', 'delivering', 'done'];

  if (!allowedStatuses.includes(status)) throw httpErr(400, 'Status tidak valid');
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Cek kepemilikan pesanan
    const pesananTargetRes = await client.query(
      `SELECT p.* FROM pesanan p
       JOIN kios k ON p.kios_id = k.id
       WHERE p.id = $1 AND k.penjual_id = $2`,
      [id, penjualId]
    );

    if (pesananTargetRes.rows.length === 0) {
      throw httpErr(404, 'Pesanan tidak ditemukan atau Anda tidak memiliki akses');
    }
    const pesananTarget = pesananTargetRes.rows[0];


    if (status === 'processing') {
      // JIKA SUDAH DIPROSES, JANGAN LAKUKAN APA-APA
      if (pesananTarget.waktu_proses_mulai) {
          await client.query('COMMIT');
          return { status: 200, body: { message: 'Pesanan sudah diproses sebelumnya', pesanan: pesananTarget } };
      }

      // 1. Ambil seluruh antrean aktif di kios yang sama
      const antreanRes = await client.query(
        `SELECT p.id, p.paid_at, p.created_at, COALESCE(p.total_estimasi,0) AS total_estimasi, p.waktu_proses_mulai
         FROM pesanan p
         WHERE p.kios_id = $1
           AND p.status IN ('paid', 'processing', 'ready', 'delivering')
           OR p.id = $2
         ORDER BY COALESCE(p.waktu_proses_mulai, p.paid_at, p.created_at) ASC, p.id ASC`,
        [pesananTarget.kios_id, id]
      );
      
      // 2. Hitung estimasi kumulatif untuk menemukan jadwal yang benar untuk pesanan ini
      let prevFinishMs = null;
      let targetStartMs = null;
      let targetFinishMs = null;

      for (const p of antreanRes.rows) {
        const isTarget = p.id == id;
        
        // Untuk pesanan target, kita anggap waktu mulainya adalah SEKARANG jika belum ada
        const anchorMs = new Date(p.waktu_proses_mulai || p.paid_at || p.created_at).getTime();
        
        // Waktu mulai adalah waktu selesai sebelumnya, atau waktu bayar, mana yang lebih akhir
        let startMs = p.waktu_proses_mulai
          ? new Date(p.waktu_proses_mulai).getTime()
          : Math.max(prevFinishMs ?? 0, anchorMs);

        // Jika ini adalah pesanan yang kita proses, dan waktu mulai terjadwalnya di masa lalu,
        // maka kita 'paksa' mulai dari SEKARANG.
        if (isTarget && startMs < Date.now()) {
            startMs = Date.now();
        }

        const durMs = Math.max(0, Number(p.total_estimasi) || 0) * 60 * 1000;
        const finishMs = startMs + durMs;

        if (isTarget) {
          targetStartMs = startMs;
          targetFinishMs = finishMs;
          // Jangan break, agar pesanan setelahnya bisa menghitung berdasarkan nilai baru ini
        }
        
        prevFinishMs = finishMs;
      }

      // 3. Update pesanan dengan jadwal yang benar
      const query = `
        UPDATE pesanan
        SET status = $1,
            waktu_proses_mulai = to_timestamp($2 / 1000.0),
            estimasi_mulai_at = to_timestamp($2 / 1000.0),
            estimasi_selesai_at = to_timestamp($3 / 1000.0),
            delayed = false
        WHERE id = $4 RETURNING *`;
      const values = [status, targetStartMs, targetFinishMs, id];
      const result = await client.query(query, values);
      
      await client.query('COMMIT');
      
      return { status: 200, body: { message: 'Status berhasil diperbarui', pesanan: result.rows[0] } };

    } else {
      // Untuk status lain, cukup update statusnya saja
      const query = `UPDATE pesanan SET status = $1 WHERE id = $2 RETURNING *`;
      const values = [status, id];
      const result = await client.query(query, values);

      if (status === 'done') {
        notifyPembeliPesananSelesaiService(id).catch(err =>
          console.error('Gagal kirim notifikasi pembeli:', err)
        );
      }
      
      await client.query('COMMIT');
      return { status: 200, body: { message: 'Status berhasil diperbarui', pesanan: result.rows[0] } };
    }

  } catch (err) {
    await (async () => { try { await client.query('ROLLBACK'); } catch (_) {} })();
    if (err.status) throw err;
    console.error('Error in updateStatusPesananService:', err);
    throw httpErr(500, 'Terjadi kesalahan server');
  } finally {
    client.release();
  }
}

// --- Riwayat pesanan (done) ---
async function getRiwayatPesananService(req) {
  const penjualId = req.user.id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = 8;
  const offset = (page - 1) * limit;

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

  const total = parseInt(countRes.rows[0].total, 10);
  const totalPages = Math.ceil(total / limit);

  const data = pesananRes.rows.map(p => ({
    ...p,
    metode_bayar: p.payment_type ? p.payment_type.toUpperCase() : 'QRIS',
    tipe_pengantaran: p.tipe_pengantaran === 'diantar' ? p.diantar_ke : 'Ambil Sendiri'
  }));

  return { status: 200, body: { page, totalPages, limit, total, data } };
}

// --- Detail riwayat pesanan (done) ---
async function getDetailRiwayatPesananService(req) {
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
  if (pesananRes.rows.length === 0)
    throw httpErr(404, 'Riwayat pesanan tidak ditemukan atau bukan milik Anda');

  const pesanan = pesananRes.rows[0];

  const antrianRes = await pool.query(
    `SELECT p.id
     FROM pesanan p
     WHERE p.status = 'done'
       AND p.kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
     ORDER BY p.paid_at ASC`,
    [penjualId]
  );
  const nomor_antrian = antrianRes.rows.findIndex(row => row.id === pesanan.id) + 1;

  const detailMenuRes = await pool.query(
    `SELECT pd.nama_menu, pd.jumlah, pd.harga, pd.subtotal, pd.foto_menu 
     FROM pesanan_detail pd 
     WHERE pd.pesanan_id = $1`,
    [id]
  );

  const menu = detailMenuRes.rows.map(item => ({
    ...item,
    foto_menu: item.foto_menu
      ? `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${item.foto_menu}`
      : null
  }));

  const data = {
    id: pesanan.id,
    nomor_antrian,
    status_label: getStatusLabel(pesanan.tipe_pengantaran, pesanan.status),
    nama: pesanan.nama_pemesan,
    no_hp: pesanan.no_hp,
    metode_bayar: pesanan.payment_type?.toUpperCase() || "QRIS",
    tipe_pengantaran: pesanan.tipe_pengantaran === "diantar" ? `${pesanan.diantar_ke}` : "Ambil Sendiri",
    tanggal_bayar: formatTanggal(pesanan.paid_at),
    tanggal_selesai: formatTanggal(pesanan.created_at),
    catatan: pesanan.catatan,
    total_harga: Number(pesanan.total_harga),
    total_estimasi: Number(pesanan.total_estimasi),
    status: pesanan.status,
    menu,
  };

  return { status: 200, body: data };
}

module.exports = {
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
};
