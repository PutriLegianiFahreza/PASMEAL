// services/keranjangService.js
const pool = require('../config/db');
const getGuestId = require('../utils/getGuestId');

const httpErr = (status, message) => {
  const e = new Error(message);
  e.status = status;
  return e;
};

// --- TAMBAH ITEM KE KERANJANG ---
async function addToKeranjangService(req) {
  const guest_id = getGuestId(req);
  const { menu_id, jumlah = 1, catatan = '' } = req.body;

  if (!guest_id || !menu_id) {
    throw httpErr(400, 'guest_id dan menu_id wajib dikirim');
  }

  // Ambil info menu
  const menuResult = await pool.query(
    'SELECT harga, kios_id, foto_menu, nama_menu FROM menu WHERE id = $1',
    [menu_id]
  );
  if (menuResult.rowCount === 0) throw httpErr(404, 'Menu tidak ditemukan');

  const { harga, kios_id, foto_menu, nama_menu } = menuResult.rows[0];

  // Cek kalau ada item dari kios lain
  const existingCart = await pool.query(
    'SELECT DISTINCT kios_id FROM keranjang WHERE guest_id = $1',
    [guest_id]
  );
  if (existingCart.rows.length > 0 && existingCart.rows[0].kios_id !== kios_id) {
    throw Object.assign(
      httpErr(409, 'Keranjang Anda masih ada dari kios lain. Hapus dulu untuk menambah menu dari kios ini'),
      { existing_kios_id: existingCart.rows[0].kios_id }
    );
  }

  // Cek apakah item sudah ada
  const existing = await pool.query(
    'SELECT * FROM keranjang WHERE guest_id = $1 AND menu_id = $2',
    [guest_id, menu_id]
  );

  let itemRow;
  let isUpdate = false;

  if (existing.rows.length > 0) {
    const newJumlah = existing.rows[0].jumlah + jumlah;
    const total_harga = harga * newJumlah;

    const updated = await pool.query(
      `UPDATE keranjang 
       SET jumlah = $1, catatan = $2, total_harga = $3 
       WHERE guest_id = $4 AND menu_id = $5 
       RETURNING *`,
      [newJumlah, (catatan || existing.rows[0].catatan), total_harga, guest_id, menu_id]
    );
    itemRow = updated.rows[0];
    isUpdate = true;
  } else {
    const total_harga = harga * jumlah;

    const inserted = await pool.query(
      `INSERT INTO keranjang (guest_id, kios_id, menu_id, jumlah, catatan, total_harga)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [guest_id, kios_id, menu_id, jumlah, catatan, total_harga]
    );
    itemRow = inserted.rows[0];
  }

  const body = {
    message: isUpdate ? 'Jumlah diperbarui' : 'Ditambahkan ke keranjang',
    item: {
      ...itemRow,
      nama_menu,
      harga,
      foto_menu,
      subtotal: harga * itemRow.jumlah,
    }
  };

  // status harus 200 saat update, 201 saat insert (sesuai perilaku lama)
  return { status: isUpdate ? 200 : 201, body };
}

// --- AMBIL KERANJANG ---
async function getKeranjangService(req) {
  const guest_id = getGuestId(req);
  if (!guest_id) throw httpErr(400, 'guest_id wajib dikirim');

  const result = await pool.query(`
    SELECT k.id, k.menu_id, k.kios_id, m.nama_menu, m.harga, m.foto_menu, 
           k.jumlah, k.catatan, (m.harga * k.jumlah) AS subtotal
    FROM keranjang k
    JOIN menu m ON k.menu_id = m.id
    WHERE k.guest_id = $1
    ORDER BY k.id DESC
  `, [guest_id]);

  const items = result.rows;
  const total_harga = items.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);
  const kios_id = items.length > 0 ? items[0].kios_id : null;

  // FE mengandalkan header X-Buyer-Id → jangan ubah
  return {
    status: 200,
    headers: { 'X-Buyer-Id': guest_id },
    body: { kios_id, items, total_harga }
  };
}

// --- UPDATE ITEM KERANJANG ---
async function updateKeranjangItemService(req) {
  const guest_id = getGuestId(req);
  const { id } = req.params;
  const { jumlah, catatan } = req.body;

  if (!guest_id) throw httpErr(400, 'guest_id wajib dikirim');

  const check = await pool.query('SELECT * FROM keranjang WHERE id = $1 AND guest_id = $2', [id, guest_id]);
  if (check.rows.length === 0) throw httpErr(404, 'Item tidak ditemukan');

  const newJumlah = (jumlah ?? check.rows[0].jumlah);

  if (newJumlah <= 0) {
    await pool.query('DELETE FROM keranjang WHERE id = $1 AND guest_id = $2', [id, guest_id]);
    return { status: 200, body: { message: 'Item dihapus karena jumlah = 0' } };
  }

  const hargaResult = await pool.query('SELECT nama_menu, harga, foto_menu FROM menu WHERE id = $1', [check.rows[0].menu_id]);
  const { harga, nama_menu, foto_menu } = hargaResult.rows[0];
  const total_harga = harga * newJumlah;

  const updated = await pool.query(
    `UPDATE keranjang
     SET jumlah = $1, catatan = COALESCE($2, catatan), total_harga = $3
     WHERE id = $4 AND guest_id = $5
     RETURNING *`,
    [newJumlah, catatan, total_harga, id, guest_id]
  );

  return {
    status: 200,
    body: {
      message: 'Item diperbarui',
      item: {
        ...updated.rows[0],
        nama_menu,
        harga,
        foto_menu,
        subtotal: total_harga,
      }
    }
  };
}

// --- HAPUS ITEM KERANJANG ---
async function removeFromKeranjangService(req) {
  const guest_id = getGuestId(req);
  const { id } = req.params;

  if (!guest_id) throw httpErr(400, 'guest_id wajib dikirim');

  const check = await pool.query(
    `SELECT k.*, m.nama_menu, m.harga, m.foto_menu
     FROM keranjang k
     JOIN menu m ON k.menu_id = m.id
     WHERE k.id = $1 AND k.guest_id = $2`,
    [id, guest_id]
  );

  if (check.rows.length === 0) throw httpErr(404, 'Item tidak ditemukan');

  await pool.query(`DELETE FROM keranjang WHERE id = $1 AND guest_id = $2`, [id, guest_id]);

  return {
    status: 200,
    body: {
      message: 'Item dihapus',
      item: {
        ...check.rows[0],
        subtotal: check.rows[0].harga * check.rows[0].jumlah
      }
    }
  };
}

module.exports = {
  addToKeranjangService,
  getKeranjangService,
  updateKeranjangItemService,
  removeFromKeranjangService,
};
