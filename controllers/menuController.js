const pool = require('../config/db');
const path = require('path');
const { formatMenu } = require('../utils/formatter');

// Ambil semua menu (penjual)
const getAllMenu = async (req, res) => {
  const penjualId = req.user.id;
  try {
    const result = await pool.query(
      'SELECT * FROM menu WHERE penjual_id = $1 ORDER BY created_at DESC',
      [penjualId]
    );

    const menus = result.rows.map(menu => formatMenu(menu, req));

    res.status(200).json(menus);
  } catch (error) {
    res.status(500).json({ message: 'Gagal mengambil menu', error: error.message });
  }
};

// Tambah menu (penjual)
const addMenu = async (req, res) => {
  const penjual_id = req.user.id;
  const kios_id = req.user.kios_id;
  const { nama_menu, deskripsi, harga, estimasi_menit, status_tersedia } = req.body;
  const foto_menu = req.file ? req.file.filename : null;

  try {
    const result = await pool.query(
      `INSERT INTO menu 
       (nama_menu, deskripsi, harga, foto_menu, penjual_id, kios_id, estimasi_menit, status_tersedia)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        nama_menu,
        deskripsi,
        harga,
        foto_menu,
        penjual_id,
        kios_id,
        estimasi_menit,
        status_tersedia !== undefined ? status_tersedia : true
      ]
    );

    // 🔥 format ulang biar foto_menu jadi URL lengkap
    const menu = formatMenu(result.rows[0], req);

    res.status(201).json({ message: 'Menu berhasil ditambahkan', data: menu });
  } catch (error) {
    res.status(500).json({ message: 'Terjadi kesalahan server', error: error.message });
  }
};

// Update menu (penjual)
const updateMenu = async (req, res) => {
  const penjual_id = req.user.id;
  const menuId = parseInt(req.params.id);
  if (isNaN(menuId)) return res.status(400).json({ message: 'ID menu tidak valid' });

  const allowedFields = ['nama_menu','deskripsi','harga','estimasi_menit','status_tersedia'];
  const updates = [];
  const values = [];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${values.length + 1}`);
      values.push(req.body[field]);
    }
  });

  if (req.file) {
    updates.push(`foto_menu = $${values.length + 1}`);
    values.push(req.file.filename);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'Tidak ada data yang diupdate' });
  }

  values.push(menuId);
  values.push(penjual_id);

  const query = `UPDATE menu SET ${updates.join(', ')} WHERE id = $${values.length - 1} AND penjual_id = $${values.length} RETURNING *`;

  try {
    const result = await pool.query(query, values);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Menu tidak ditemukan atau bukan milik kamu' });

    // 🔥 format ulang biar foto_menu jadi URL lengkap
    const menu = formatMenu(result.rows[0], req);

    res.status(200).json({ message: 'Menu berhasil diupdate', data: menu });
  } catch (error) {
    res.status(500).json({ message: 'Terjadi kesalahan server', error: error.message });
  }
};

// Ambil detail menu (penjual)
const getMenuById = async (req, res) => {
  const penjualId = req.user.id;
  const menuId = parseInt(req.params.id);
  if (isNaN(menuId)) return res.status(400).json({ message: 'ID menu tidak valid' });

  try {
    const result = await pool.query(
      'SELECT * FROM menu WHERE id = $1 AND penjual_id = $2',
      [menuId, penjualId]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Menu tidak ditemukan' });

    const menu = formatMenu(result.rows[0], req);

    res.status(200).json(menu);
  } catch (error) {
    res.status(500).json({ message: 'Gagal mengambil detail menu', error: error.message });
  }
};

// Hapus menu (penjual)
const deleteMenu = async (req, res) => {
  const penjualId = req.user.id;
  const menuId = parseInt(req.params.id);
  if (isNaN(menuId)) return res.status(400).json({ message: 'ID menu tidak valid' });

  try {
    const result = await pool.query('DELETE FROM menu WHERE id = $1 AND penjual_id = $2 RETURNING *', [menuId, penjualId]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Menu tidak ditemukan atau bukan milik kamu' });
    res.status(200).json({ message: 'Menu berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ message: 'Gagal menghapus menu', error: error.message });
  }
};

// Ambil menu dengan pagination (penjual)
const getMenusPaginated = async (req, res) => {
  const penjualId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  try {
    const totalResult = await pool.query(
      'SELECT COUNT(*) FROM menu WHERE penjual_id = $1',
      [penjualId]
    );
    const total = parseInt(totalResult.rows[0].count);

    const result = await pool.query(
      'SELECT * FROM menu WHERE penjual_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [penjualId, limit, offset]
    );

    const menus = result.rows.map(menu => formatMenu(menu, req));

    res.status(200).json({
      page,
      limit,
      total,  
      data: menus,
    });
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil menu', error: err.message });
  }
};

// Ambil 5 menu terbaru (pembeli)
const getNewMenus = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM menu WHERE status_tersedia = true ORDER BY created_at DESC LIMIT 5'
    );

    const menus = result.rows.map(menu => formatMenu(menu, req));

    res.json(menus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cari menu (pembeli)
const searchMenus = async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ message: 'Query pencarian wajib diisi' });

  try {
    const result = await pool.query(
      'SELECT * FROM menu WHERE nama_menu ILIKE $1 AND status_tersedia = true',
      [`%${query}%`]
    );

    const menus = result.rows.map(menu => formatMenu(menu, req));

    res.json(menus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cari menu di kios tertentu (pembeli)
const searchMenusByKios = async (req, res) => {
  const { query } = req.query;
  const kiosId = parseInt(req.params.id);
  if (!query) return res.status(400).json({ message: 'Query pencarian wajib diisi' });
  if (isNaN(kiosId)) return res.status(400).json({ message: 'ID kios tidak valid' });

  try {
    const result = await pool.query(
      'SELECT * FROM menu WHERE kios_id = $1 AND nama_menu ILIKE $2 AND status_tersedia = true',
      [kiosId, `%${query}%`]
    );

    const menus = result.rows.map(menu => formatMenu(menu, req));

    res.json(menus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Detail menu (pembeli)
const getMenuByIdForBuyer = async (req, res) => {
  const menuId = parseInt(req.params.id);
  if (isNaN(menuId)) return res.status(400).json({ message: 'ID menu tidak valid' });

  try {
    const result = await pool.query(
      'SELECT foto_menu, nama_menu, deskripsi, harga, estimasi_menit FROM menu WHERE id = $1 AND status_tersedia = true',
      [menuId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Menu tidak ditemukan' });
    }

    const menu = result.rows[0];

    // ✅ Format foto_menu jadi URL lengkap (pakai BASE_URL kalau ada)
    const BASE_URL = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    res.status(200).json({
      ...menu,
      foto_menu: menu.foto_menu
        ? `${BASE_URL}/uploads/${menu.foto_menu}`
        : null
    });
  } catch (error) {
    res.status(500).json({ message: 'Gagal mengambil detail menu', error: error.message });
  }
};

module.exports = {
  getAllMenu,
  addMenu,
  updateMenu,
  getMenuById,
  deleteMenu,
  getNewMenus,
  searchMenus,
  searchMenusByKios,
  getMenuByIdForBuyer,
  getMenusPaginated
};
