const pool = require('../config/db');
const cloudinary = require('../utils/cloudinary');
const fs = require('fs');

// Ambil semua menu (penjual)
const getAllMenu = async (req, res) => {
  const penjualId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT id, nama_menu, harga, deskripsi, foto_menu, status_tersedia, estimasi_menit, created_at
       FROM menu 
       WHERE penjual_id = $1 
       ORDER BY created_at DESC`,
      [penjualId]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Gagal mengambil menu', error: error.message });
  }
};

// Tambah menu (penjual)
const addMenu = async (req, res) => {
  try {
    const penjual_id = req.user.id;
    const kios_id = req.user.kios_id;

    // Ambil data dari body, gunakan default kalau undefined
    let { nama_menu, deskripsi, harga, estimasi_menit, status_tersedia } = req.body;

    nama_menu = nama_menu?.trim() || ''; // default string kosong
    deskripsi = deskripsi?.trim() || '';
    harga = harga !== undefined ? parseInt(harga, 10) : 0; // default 0 jika undefined
    estimasi_menit = estimasi_menit !== undefined ? parseInt(estimasi_menit, 10) : 10;
    status_tersedia = status_tersedia !== undefined ? status_tersedia : true;

    let foto_menu = null;
    let foto_public_id = null;

    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(req.file.path, { folder: 'menus' });
      fs.unlinkSync(req.file.path); // hapus file lokal
      foto_menu = uploadResult.secure_url;
      foto_public_id = uploadResult.public_id;
    }

    // Debug sebelum insert
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

    res.status(201).json({ 
      message: 'Menu berhasil ditambahkan', 
      data: dbResult.rows[0] 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Terjadi kesalahan server', error: error.message });
  }
};

// Update menu
// Update menu
const updateMenu = async (req, res) => {
  const { id } = req.params;
  let { nama_menu, harga, deskripsi, status_tersedia, estimasi_menit } = req.body;

  try {
    // Ambil data lama
    const existing = await pool.query(
      "SELECT * FROM menu WHERE id = $1 AND penjual_id = $2",
      [id, req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: "Menu tidak ditemukan atau bukan milik Anda" });
    }

    const oldMenu = existing.rows[0];
    let foto_menu = oldMenu.foto_menu;
    let foto_public_id = oldMenu.foto_public_id;

    if (req.file) {
      // Kalau ada foto baru, hapus yang lama
      if (foto_public_id) {
        await cloudinary.uploader.destroy(foto_public_id);
      }

      // Upload yang baru
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: "menus",
      });

      foto_menu = uploadResult.secure_url;
      foto_public_id = uploadResult.public_id;

      // hapus file lokal
      fs.unlinkSync(req.file.path);
    }

    // Gunakan nilai baru kalau ada, kalau tidak pakai nilai lama
    const result = await pool.query(
      `UPDATE menu 
       SET nama_menu = $1, 
           harga = $2, 
           deskripsi = $3, 
           status_tersedia = $4,
           estimasi_menit = $5,
           foto_menu = $6, 
           foto_public_id = $7
       WHERE id = $8 AND penjual_id = $9
       RETURNING *`,
      [
        nama_menu ?? oldMenu.nama_menu,
        harga ?? oldMenu.harga,
        deskripsi ?? oldMenu.deskripsi,
        status_tersedia ?? oldMenu.status_tersedia,
        estimasi_menit ?? oldMenu.estimasi_menit,
        foto_menu,
        foto_public_id,
        id,
        req.user.id,
      ]
    );

    res.json({ message: "Menu berhasil diperbarui", menu: result.rows[0] });
  } catch (error) {
    console.error("Error update menu:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server" });
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

    res.status(200).json(result.rows[0]);
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
    // ambil data dulu biar bisa hapus fotonya
    const menu = await pool.query('SELECT foto_public_id FROM menu WHERE id = $1 AND penjual_id = $2', [menuId, penjualId]);
    if (menu.rows.length === 0) {
      return res.status(404).json({ message: 'Menu tidak ditemukan atau bukan milik kamu' });
    }

    if (menu.rows[0].foto_public_id) {
      await cloudinary.uploader.destroy(menu.rows[0].foto_public_id);
    }

    await pool.query('DELETE FROM menu WHERE id = $1 AND penjual_id = $2', [menuId, penjualId]);
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
    const totalResult = await pool.query('SELECT COUNT(*) FROM menu WHERE penjual_id = $1', [penjualId]);
    const total = parseInt(totalResult.rows[0].count);

    const result = await pool.query(
      `SELECT id, nama_menu, harga, deskripsi, foto_menu, status_tersedia, estimasi_menit, created_at
       FROM menu 
       WHERE penjual_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [penjualId, limit, offset]
    );

    res.status(200).json({ page, limit, total, data: result.rows });
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil menu', error: err.message });
  }
};

// Ambil 5 menu terbaru (pembeli)
const getNewMenus = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, foto_menu, nama_menu, deskripsi, harga, estimasi_menit, status_tersedia FROM menu ORDER BY created_at DESC LIMIT 5'
    );
    res.json(result.rows);
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
      'SELECT id, foto_menu, nama_menu, deskripsi, harga, estimasi_menit, status_tersedia FROM menu WHERE nama_menu ILIKE $1',
      [`%${query}%`]
    );
    res.json(result.rows);
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
      'SELECT id, foto_menu, nama_menu, deskripsi, harga, estimasi_menit, status_tersedia FROM menu WHERE kios_id = $1 AND nama_menu ILIKE $2',
      [kiosId, `%${query}%`]
    );
    res.json(result.rows);
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
      'SELECT id, foto_menu, nama_menu, deskripsi, harga, estimasi_menit, status_tersedia FROM menu WHERE id = $1',
      [menuId]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Menu tidak ditemukan' });

    res.status(200).json(result.rows[0]);
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
