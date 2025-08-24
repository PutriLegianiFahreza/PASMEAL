const pool = require('../config/db');
const cloudinary = require('../utils/cloudinary');
const fs = require('fs');

// Ambil semua menu (penjual)
const getAllMenu = async (req, res) => {
  const penjualId = req.user.id;
  try {
    const result = await pool.query(
      'SELECT * FROM menu WHERE penjual_id = $1 ORDER BY created_at DESC',
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
    const { nama_menu, deskripsi, harga, estimasi_menit, status_tersedia } = req.body;

    let foto_menu = null;
    let foto_public_id = null;

    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(req.file.path, { folder: 'menus' });
      fs.unlinkSync(req.file.path); // hapus file lokal
      foto_menu = uploadResult.secure_url;
      foto_public_id = uploadResult.public_id;
    }

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
        status_tersedia !== undefined ? status_tersedia : true
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
const updateMenu = async (req, res) => {
  const { id } = req.params;
  const { nama_menu, harga, deskripsi } = req.body;

  try {
    // Pastikan menu milik penjual yang login
    const existing = await pool.query(
      "SELECT foto_public_id FROM menu WHERE id = $1 AND penjual_id = $2",
      [id, req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: "Menu tidak ditemukan atau bukan milik Anda" });
    }

    let foto_menu = null;
    let foto_public_id = existing.rows[0].foto_public_id;

    if (req.file) {
      // Kalau ada foto baru, hapus yang lama
      if (foto_public_id) {
        await cloudinary.uploader.destroy(foto_public_id);
      }

      // Upload yang baru
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: "menu",
      });

      foto_menu = uploadResult.secure_url;
      foto_public_id = uploadResult.public_id;

      // hapus file lokal
      fs.unlinkSync(req.file.path);
    }

    const result = await pool.query(
      `UPDATE menu 
       SET nama_menu = $1, harga = $2, deskripsi = $3, 
           foto_menu = COALESCE($4, foto_menu), 
           foto_public_id = COALESCE($5, foto_public_id)
       WHERE id = $6 AND penjual_id = $7
       RETURNING *`,
      [nama_menu, harga, deskripsi, foto_menu, foto_public_id, id, req.user.id]
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
      'SELECT * FROM menu WHERE penjual_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
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
    const result = await pool.query('SELECT * FROM menu WHERE status_tersedia = true ORDER BY created_at DESC LIMIT 5');
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
    const result = await pool.query('SELECT * FROM menu WHERE nama_menu ILIKE $1 AND status_tersedia = true', [`%${query}%`]);
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
      'SELECT * FROM menu WHERE kios_id = $1 AND nama_menu ILIKE $2 AND status_tersedia = true',
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
      'SELECT foto_menu, nama_menu, deskripsi, harga, estimasi_menit FROM menu WHERE id = $1 AND status_tersedia = true',
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
