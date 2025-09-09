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

// --- Status pesanan untuk guest: timer hanya saat processing/ready/delivering, pakai timestamp persist ---
async function getStatusPesananGuestService(req) {
  const pesananId = parseInt(req.params.id, 10);
  // ⬇⬇⬇ Fallback ambil dari query ?guest_id= / ?gid=
  const guest_id = req.query.guest_id || req.query.gid || getGuestId(req);
  if (isNaN(pesananId)) throw httpErr(400, 'ID pesanan tidak valid');
  if (!guest_id) throw httpErr(401, 'Guest tidak terdeteksi');

  // Ambil target
  const tRes = await pool.query(
    `SELECT id, kios_id, status, created_at, paid_at, waktu_proses_mulai,
            estimasi_mulai_at, estimasi_selesai_at,
            COALESCE(total_estimasi,0) AS total_estimasi
       FROM pesanan
      WHERE id = $1 AND guest_id = $2
      LIMIT 1`,
    [pesananId, guest_id]  // ⬅ tetap validasi milik guest tsb
  );
  if (!tRes.rows.length) throw httpErr(404, 'Pesanan tidak ditemukan');

  const t = tRes.rows[0];

  // === CASE A: sudah diproses / sedang jalan → tampilkan countdown DARI TIMESTAMP PERSIST ===
  if (['processing','ready','delivering'].includes(String(t.status).toLowerCase()) && t.estimasi_selesai_at) {
    const endMs = new Date(t.estimasi_selesai_at).getTime();
    const nowMs = Date.now();
    const remaining_seconds = Math.max(0, Math.floor((endMs - nowMs) / 1000));

    return {
      status: 200,
      body: {
        status: t.status,
        estimasi_selesai_at: new Date(endMs).toISOString(),
        remaining_seconds,
        remaining_minutes: Math.ceil(remaining_seconds / 60),
        server_time: new Date().toISOString(),
        eta_at: new Date(endMs).toISOString()
      }
    };
  }

  // === CASE B: belum diproses (pending/paid) → JANGAN tampilkan countdown ===
  const anchorTarget = t.waktu_proses_mulai || t.paid_at || t.created_at;
  const aheadRes = await pool.query(
    `
    SELECT COUNT(*)::int AS ahead
      FROM pesanan p
     WHERE p.kios_id = $1
       AND LOWER(p.status) IN ('paid','processing','ready','delivering')
       AND (
         COALESCE(p.waktu_proses_mulai, p.paid_at) < COALESCE($2, $3)
         OR (
           COALESCE(p.waktu_proses_mulai, p.paid_at) = COALESCE($2, $3)
           AND p.id < $4
         )
       )
    `,
    [t.kios_id, t.waktu_proses_mulai, t.paid_at, t.id]
  );
  const queue_position = (aheadRes.rows[0]?.ahead ?? 0) + 1;

  return {
    status: 200,
    body: {
      status: t.status,
      estimasi_selesai_at: null,
      remaining_seconds: 0,
      remaining_minutes: 0,
      queue_position,
      server_time: new Date().toISOString()
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

// --- Pesanan masuk untuk penjual (kalkulasi kumulatif stabil; pakai anchor persist) ---
async function getPesananMasukService(req) {
  const penjualId = Number(req.user.id || req.user.penjual_id);
  if (isNaN(penjualId)) throw httpErr(400, 'User ID tidak valid');

  const page = parseInt(req.query.page, 10) || 1;
  const limit = 8;
  const offset = (page - 1) * limit;

  // Hitung kumulatif per kios; anchor = COALESCE(waktu_proses_mulai, paid_at)
  const rows = (await pool.query(
    `
    WITH aktif AS (
      SELECT
        p.*,
        COALESCE(p.waktu_proses_mulai, p.paid_at) AS anchor_time
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
      u.estimasi_mulai_at, u.estimasi_selesai_at,
      u.anchor_time,
      u.nomor_antrian_kios,

      -- kalkulasi target SEANDAINYA belum diproses (preview untuk operator)
      (u.anchor_time + (u.cum_estimasi_menit * INTERVAL '1 minute')) AS estimasi_selesai_at_calc
    FROM urut u
    ORDER BY u.kios_id ASC, u.anchor_time ASC, u.id ASC
    LIMIT $2 OFFSET $3
    `,
    [penjualId, limit, offset]
  )).rows;

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM pesanan p
      WHERE p.kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
        AND LOWER(p.status) IN ('paid','processing','ready','delivering')`,
    [penjualId]
  );
  const total = countRes.rows[0].total;
  const totalPages = Math.ceil(total / limit);
  const now = Date.now();

  const data = rows.map(row => {
    // Gunakan target persist jika ADA; kalau belum, pakai calc preview (hanya untuk penjual)
    const persistEnd = row.estimasi_selesai_at ? new Date(row.estimasi_selesai_at).toISOString() : null;
    const calcEnd = row.estimasi_selesai_at_calc ? new Date(row.estimasi_selesai_at_calc).toISOString() : null;
    const endIso = persistEnd || calcEnd;
    const etaSec = endIso ? Math.max(0, Math.floor((new Date(endIso).getTime() - now) / 1000)) : 0;

    return {
      id: row.id,
      nomor_antrian: row.nomor_antrian_kios,
      pesanan_id: row.id,
      kios_id: row.kios_id,
      tanggal_bayar: formatTanggal(row.paid_at || row.created_at),
      nama: row.nama_pemesan,
      no_hp: row.no_hp,
      metode_bayar: row.payment_type?.toUpperCase() || 'QRIS',
      tipe_pengantaran: row.tipe_pengantaran === 'diantar' ? `${row.diantar_ke}` : 'Ambil Sendiri',
      total_harga: Number(row.total_harga),
      total_estimasi: Number(row.total_estimasi),
      estimasi_selesai_at: endIso,          // sumber kebenaran UI
      eta_menit_kumulatif: Math.ceil(etaSec / 60), // kompat lama
      eta_seconds_kumulatif: etaSec,        // untuk Timer FE penjual
      status: getStatusLabel(row.tipe_pengantaran, row.status),
    };
  });

  return { status: 200, body: { page, totalPages, limit, total, data, server_time: new Date().toISOString() } };
}


// --- Detail pesanan masuk (jadwal kumulatif serial & anchor konsisten) ---
async function getDetailPesananMasukService(req) {
  const pesananAntreanRes = await pool.query(
    `SELECT p.id, p.paid_at, p.created_at, COALESCE(p.total_estimasi,0) AS total_estimasi,
            p.status, p.tipe_pengantaran, p.nama_pemesan, p.no_hp, p.payment_type, p.diantar_ke,
            p.catatan, p.total_harga, p.kios_id, p.waktu_proses_mulai,
            p.estimasi_mulai_at, p.estimasi_selesai_at
       FROM pesanan p
      WHERE p.kios_id IN (SELECT id FROM kios WHERE penjual_id = $1)
        AND p.status IN ('paid', 'processing', 'ready', 'delivering')
      ORDER BY COALESCE(p.waktu_proses_mulai, p.paid_at) ASC, p.id ASC`,
    [req.user.id]
  );

  if (!pesananAntreanRes.rows.length) throw httpErr(404, 'Tidak ada pesanan aktif');

  // Jadwalkan secara serial berbasis anchor persist
  let prevFinishMs = null;
  const scheduled = pesananAntreanRes.rows.map((p, idx) => {
    const anchor = p.waktu_proses_mulai || p.paid_at;              // << konsisten
    const baseStartMs = anchor ? new Date(anchor).getTime() : Date.now();
    const startMs = Math.max(prevFinishMs ?? baseStartMs, baseStartMs);
    const durMs = Math.max(0, Number(p.total_estimasi) || 0) * 60 * 1000;
    const finishMs = startMs + durMs;
    prevFinishMs = finishMs;

    // Jika sudah ada persist (estimasi_mulai_at / selesai), gunakan itu (stabil saat refresh)
    const finalStartIso = p.estimasi_mulai_at ? new Date(p.estimasi_mulai_at).toISOString() : new Date(startMs).toISOString();
    const finalEndIso   = p.estimasi_selesai_at ? new Date(p.estimasi_selesai_at).toISOString() : new Date(finishMs).toISOString();

    return {
      ...p,
      nomor_antrian: idx + 1,
      estimasi_mulai_at: finalStartIso,
      estimasi_selesai_at: finalEndIso,
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
    foto_menu: item.foto_menu ? `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${item.foto_menu}` : null
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

    // pastikan pesanan milik kios si penjual
    const pesananTargetRes = await client.query(
      `SELECT p.*
         FROM pesanan p
         JOIN kios k ON p.kios_id = k.id
        WHERE p.id = $1 AND k.penjual_id = $2
        LIMIT 1`,
      [id, penjualId]
    );
    if (!pesananTargetRes.rows.length)
      throw httpErr(404, 'Pesanan tidak ditemukan atau Anda tidak memiliki akses');

    const pesananTarget = pesananTargetRes.rows[0];

    // transisi khusus ke PROCESSING (set jadwal serial)
    if (status === 'processing') {
      if (pesananTarget.waktu_proses_mulai) {
        await client.query('COMMIT');
        return { status: 200, body: { message: 'Pesanan sudah diproses sebelumnya', pesanan: pesananTarget } };
      }

      const menit = Number(pesananTarget.total_estimasi || 0);

      // start_at = max(NOW, finish terakhir di kios)
      const startRow = await client.query(
        `SELECT GREATEST(
            NOW(),
            COALESCE(MAX(estimasi_selesai_at), NOW())
          ) AS start_at
         FROM pesanan
        WHERE kios_id = $1
          AND status IN ('processing','ready','delivering')`,
        [pesananTarget.kios_id]
      );
      const startAt = startRow.rows[0].start_at; // timestamptz dari PG

      // ⚠️ PISAHKAN PARAM untuk beda tipe kolom:
      // - waktu_proses_mulai: kemungkinan TIMESTAMP (tanpa TZ)
      // - estimasi_mulai_at / estimasi_selesai_at: TIMESTAMPTZ
      const upd = await client.query(
        `UPDATE pesanan
            SET status = 'processing',
                waktu_proses_mulai = $1::timestamp,
                estimasi_mulai_at  = $2::timestamptz,
                estimasi_selesai_at = $2::timestamptz + ($3 * INTERVAL '1 minute'),
                delayed = false
          WHERE id = $4
            AND kios_id = $5
        RETURNING *`,
        [startAt, startAt, menit, id, pesananTarget.kios_id]
      );

      await client.query('COMMIT');
      return { status: 200, body: { message: 'Status berhasil diperbarui', pesanan: upd.rows[0] } };
    }

    // transisi status lain (paid/ready/delivering/done/pending)
    let upd;
    if (status === 'paid') {
      // isi paid_at jika belum ada (penting untuk antrian & ETA)
      upd = await client.query(
        `UPDATE pesanan
            SET status = 'paid',
                paid_at = COALESCE(paid_at, NOW())
          WHERE id = $1
            AND kios_id = $2
        RETURNING *`,
        [id, pesananTarget.kios_id]
      );
    } else {
      upd = await client.query(
        `UPDATE pesanan
            SET status = $1
          WHERE id = $2
            AND kios_id = $3
        RETURNING *`,
        [status, id, pesananTarget.kios_id]
      );
    }

    if (!upd.rows.length) throw httpErr(404, 'Pesanan tidak ditemukan untuk diperbarui');

    if (status === 'done') {
      // kirim notif pembeli, fire-and-forget
      notifyPembeliPesananSelesaiService(id).catch(err =>
        console.error('Gagal kirim notifikasi pembeli:', err)
      );
    }

    await client.query('COMMIT');
    return { status: 200, body: { message: 'Status berhasil diperbarui', pesanan: upd.rows[0] } };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
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
