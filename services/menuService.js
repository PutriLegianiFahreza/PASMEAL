// services/menuService.js
const pool = require('../config/db');
const cloudinary = require('../utils/cloudinary');
const fs = require('fs');

const httpErr = (status, message) => {
  const e = new Error(message);
  e.status = status;
  return e;
};

/* === Ambil semua menu (penjual) === */
async function getAllMenuService(req) {
  const penjualId = req.user.id;
  const result = await pool.query(
    `SELECT id, nama_menu, harga, deskripsi, foto_menu, status_tersedia, estimasi_menit, created_at
     FROM menu 
     WHERE penjual_id = $1 
     ORDER BY created_at DESC`,
    [penjualId]
  );
  return { status: 200, body: result.rows };
}

/* === Tambah menu (penjual) === */
async function addMenuService(req) {
  const penjual_id = req.user.id;
  const kios_id = req.user.kios_id;

  let { nama_menu, deskripsi, harga, estimasi_menit, status_tersedia } = req.body;

  nama_menu = nama_menu?.trim() || '';
  deskripsi = deskripsi?.trim() || '';
  harga = harga !== undefined ? parseInt(harga, 10) : 0;
  estimasi_menit = estimasi_menit !== undefined ? parseInt(estimasi_menit, 10) : 10;
  status_tersedia = status_tersedia !== undefined ? status_tersedia : true;

  let foto_menu = null;
  let foto_public_id = null;

  if (req.file) {
    const uploadResult = await cloudinary.uploader.upload(req.file.path, { folder: 'menus' });
    fs.unlinkSync(req.file.path);
    foto_menu = uploadResult.secure_url;
    foto_public_id = uploadResult.public_id;
  }

  // Debug (dipertahankan agar behavior/log tetap sama)
  // eslint-disable-next-line no-console
  console.log({ nama_menu, deskripsi, harga, estimasi_menit, status_tersedia, penjual_id, kios_id });

  const dbResult = await pool.query(
    `INSERT INTO menu 
     (nama_menu, deskripsi, harga, foto_menu, foto_public_id, penjual_id, kios_id, estimasi_menit, status_tersedia)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      nama_menu,
      deskripsi,
      harga,
      foto_menu,
      foto_public_id,
      penjual_id,
      kios_id,
      estimasi_menit,
      status_tersedia
    ]
  );

  return {
    status: 201,
    body: { message: 'Menu berhasil ditambahkan', data: dbResult.rows[0] }
  };
}

/* === Update menu (penjual) === */
async function updateMenuService(req) {
  const { id } = req.params;
  const penjual_id = req.user.id;
  const {
    nama_menu,
    deskripsi,
    harga,
    status_tersedia,
    kios_id,
    estimasi_menit,
  } = req.body;

  // 1. Ambil data menu lama
  const result = await pool.query('SELECT * FROM menu WHERE id = $1 AND penjual_id = $2', [id, penjual_id]);

  if (result.rows.length === 0) {
    if (req.file) fs.unlinkSync(req.file.path);
    throw httpErr(404, 'Menu tidak ditemukan');
  }

  const oldMenu = result.rows[0];

  // default: pakai foto lama
  let newFotoUrl = oldMenu.foto_menu;
  let newFotoPublicId = oldMenu.foto_public_id;

  // 2. Jika ada file baru → upload ke Cloudinary
  if (req.file) {
    try {
      const resultUpload = await cloudinary.uploader.upload(req.file.path);
      newFotoUrl = resultUpload.secure_url;
      newFotoPublicId = resultUpload.public_id;

      fs.unlinkSync(req.file.path);

      if (oldMenu.foto_public_id) {
        await cloudinary.uploader.destroy(oldMenu.foto_public_id);
      }
    } catch (uploadError) {
      // eslint-disable-next-line no-console
      console.error('Gagal saat mengunggah ke Cloudinary:', uploadError);
      fs.unlinkSync(req.file.path);
      throw httpErr(500, 'Gagal memperbarui gambar');
    }
  }

  // 3. Data update (pakai body baru, fallback ke lama)
  const updatedData = {
    nama_menu: nama_menu ?? oldMenu.nama_menu,
    deskripsi: deskripsi ?? oldMenu.deskripsi,
    harga: harga ?? oldMenu.harga,
    status_tersedia: status_tersedia ?? oldMenu.status_tersedia,
    kios_id: kios_id ?? oldMenu.kios_id,
    estimasi_menit: estimasi_menit ?? oldMenu.estimasi_menit,
  };

  // 4. Update DB
  const updated = await pool.query(
    `UPDATE menu
     SET nama_menu = $1, deskripsi = $2, harga = $3, foto_menu = $4, 
         status_tersedia = $5, kios_id = $6, estimasi_menit = $7, foto_public_id = $8
     WHERE id = $9 AND penjual_id = $10
     RETURNING *`,
    [
      updatedData.nama_menu,
      updatedData.deskripsi,
      updatedData.harga,
      newFotoUrl,
      updatedData.status_tersedia,
      updatedData.kios_id,
      updatedData.estimasi_menit,
      newFotoPublicId,
      id,
      penjual_id
    ]
  );

  return { status: 200, body: { message: 'Menu berhasil diperbarui', menu: updated.rows[0] } };
}

/* === Ambil detail menu (penjual) === */
async function getMenuByIdService(req) {
  const penjualId = req.user.id;
  const menuId = parseInt(req.params.id, 10);
  if (isNaN(menuId)) throw httpErr(400, 'ID menu tidak valid');

  const result = await pool.query(
    'SELECT * FROM menu WHERE id = $1 AND penjual_id = $2',
    [menuId, penjualId]
  );
  if (result.rowCount === 0) throw httpErr(404, 'Menu tidak ditemukan');

  return { status: 200, body: result.rows[0] };
}

/* === Hapus menu (penjual) === */
async function deleteMenuService(req) {
  const penjualId = req.user.id;
  const menuId = parseInt(req.params.id, 10);
  if (isNaN(menuId)) throw httpErr(400, 'ID menu tidak valid');

  const menu = await pool.query(
    'SELECT foto_public_id FROM menu WHERE id = $1 AND penjual_id = $2',
    [menuId, penjualId]
  );
  if (menu.rows.length === 0) throw httpErr(404, 'Menu tidak ditemukan atau bukan milik kamu');

  if (menu.rows[0].foto_public_id) {
    await cloudinary.uploader.destroy(menu.rows[0].foto_public_id);
  }

  await pool.query('DELETE FROM menu WHERE id = $1 AND penjual_id = $2', [menuId, penjualId]);
  return { status: 200, body: { message: 'Menu berhasil dihapus' } };
}

/* === Ambil menu dengan pagination (penjual) === */
async function getMenusPaginatedService(req) {
  const penjualId = req.user.id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;

  const totalResult = await pool.query('SELECT COUNT(*) FROM menu WHERE penjual_id = $1', [penjualId]);
  const total = parseInt(totalResult.rows[0].count, 10);

  const result = await pool.query(
    `SELECT id, nama_menu, harga, deskripsi, foto_menu, status_tersedia, estimasi_menit, created_at
     FROM menu 
     WHERE penjual_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2 OFFSET $3`,
    [penjualId, limit, offset]
  );

  return { status: 200, body: { page, limit, total, data: result.rows } };
}

/* === Ambil 5 menu terbaru (pembeli) === */
async function getNewMenusService() {
  const result = await pool.query(
    'SELECT id, foto_menu, nama_menu, deskripsi, harga, estimasi_menit, status_tersedia FROM menu ORDER BY created_at DESC LIMIT 5'
  );
  return { status: 200, body: result.rows };
}

/* === Cari menu (pembeli) === */
async function searchMenusService(req) {
  const { query } = req.query;
  if (!query) throw httpErr(400, 'Query pencarian wajib diisi');

  const result = await pool.query(
    'SELECT id, foto_menu, nama_menu, deskripsi, harga, estimasi_menit, status_tersedia FROM menu WHERE nama_menu ILIKE $1',
    [`%${query}%`]
  );
  return { status: 200, body: result.rows };
}

/* === Cari menu di kios tertentu (pembeli) === */
async function searchMenusByKiosService(req) {
  const { query } = req.query;
  const kiosId = parseInt(req.params.id, 10);
  if (!query) throw httpErr(400, 'Query pencarian wajib diisi');
  if (isNaN(kiosId)) throw httpErr(400, 'ID kios tidak valid');

  const result = await pool.query(
    'SELECT id, foto_menu, nama_menu, deskripsi, harga, estimasi_menit, status_tersedia FROM menu WHERE kios_id = $1 AND nama_menu ILIKE $2',
    [kiosId, `%${query}%`]
  );
  return { status: 200, body: result.rows };
}

/* === Detail menu (pembeli) === */
async function getMenuByIdForBuyerService(req) {
  const menuId = parseInt(req.params.id, 10);
  if (isNaN(menuId)) throw httpErr(400, 'ID menu tidak valid');

  const result = await pool.query(
    'SELECT id, foto_menu, nama_menu, deskripsi, harga, estimasi_menit, status_tersedia FROM menu WHERE id = $1',
    [menuId]
  );
  if (result.rowCount === 0) throw httpErr(404, 'Menu tidak ditemukan');

  return { status: 200, body: result.rows[0] };
}

module.exports = {
  getAllMenuService,
  addMenuService,
  updateMenuService,
  getMenuByIdService,
  deleteMenuService,
  getMenusPaginatedService,
  getNewMenusService,
  searchMenusService,
  searchMenusByKiosService,
  getMenuByIdForBuyerService,
};
