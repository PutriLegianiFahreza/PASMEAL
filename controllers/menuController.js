const pool = require('../config/db');
const path = require('path');

// Ambil semua menu milik penjual
const getAllMenu = async (req, res) => {
  const penjualId = req.user.id;

  try {
    const result = await pool.query(
      'SELECT * FROM menu WHERE penjual_id = $1 ORDER BY id DESC',
      [penjualId]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Gagal mengambil menu', error });
  }
};

// Tambah menu
const addMenu = async (req, res) => {
  const penjual_id = req.user.id;
  const { nama_menu, deskripsi, harga, estimasi_menit, status_tersedia } = req.body; // ganti di sini
  const foto_menu = req.file ? req.file.filename : null;

  try {
    const result = await pool.query(
      `INSERT INTO menu 
       (nama_menu, deskripsi, harga, foto_menu, penjual_id, estimasi_menit, status_tersedia)  -- ganti di sini
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        nama_menu,
        deskripsi,
        harga,
        foto_menu,
        penjual_id,
        estimasi_menit,   // ganti di sini
        status_tersedia !== undefined ? status_tersedia : true
      ]
    );

    res.status(201).json({
      message: 'Menu berhasil ditambahkan',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Gagal tambah menu:', error);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// Update menu
const updateMenu = async (req, res) => {
  const penjualId = req.user.id;
  const menuId = req.params.id;
  const { nama_menu, harga, deskripsi, estimasi_menit, status_tersedia } = req.body;  // ganti di sini
  const foto_menu = req.file ? req.file.filename : null;

  try {
    const currentMenu = await pool.query(
      'SELECT * FROM menu WHERE id = $1 AND penjual_id = $2',
      [menuId, penjualId]
    );

    if (currentMenu.rowCount === 0) {
      return res.status(404).json({ message: 'Menu tidak ditemukan atau bukan milik kamu' });
    }

    const updatedMenu = await pool.query(
      `UPDATE menu 
       SET nama_menu = $1, 
           harga = $2, 
           deskripsi = $3, 
           foto_menu = COALESCE($4, foto_menu), 
           estimasi_menit = $5,  -- ganti di sini
           status_tersedia = $6
       WHERE id = $7 AND penjual_id = $8 RETURNING *`,
      [
        nama_menu,
        harga,
        deskripsi,
        foto_menu,
        estimasi_menit,  // ganti di sini
        status_tersedia !== undefined ? status_tersedia : currentMenu.rows[0].status_tersedia,
        menuId,
        penjualId
      ]
    );

    res.status(200).json({
      message: 'Menu berhasil diupdate',
      data: updatedMenu.rows[0],
    });
  } catch (error) {
    res.status(500).json({ message: 'Gagal update menu', error });
  }
};

// Ambil detail 1 menu
const getMenuById = async (req, res) => {
  const penjualId = req.user.id;
  const menuId = req.params.id;

  try {
    const result = await pool.query(
      'SELECT * FROM menu WHERE id = $1 AND penjual_id = $2',
      [menuId, penjualId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Menu tidak ditemukan' });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Gagal mengambil detail menu', error });
  }
};

// Hapus menu
const deleteMenu = async (req, res) => {
  const penjualId = req.user.id;
  const menuId = req.params.id;

  try {
    const result = await pool.query(
      'DELETE FROM menu WHERE id = $1 AND penjual_id = $2 RETURNING *',
      [menuId, penjualId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Menu tidak ditemukan atau bukan milik kamu' });
    }

    res.status(200).json({ message: 'Menu berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ message: 'Gagal menghapus menu', error });
  }
};

// Ambil 10 menu terbaru
const getNewMenus = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM menu ORDER BY created_at DESC LIMIT 10'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cari menu berdasarkan nama (untuk pembeli)
const searchMenus = async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ message: 'Query pencarian wajib diisi' });

  try {
    const result = await pool.query(
      'SELECT * FROM menu WHERE nama_menu ILIKE $1',
      [`%${query}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cari menu berdasarkan nama di kios tertentu
const searchMenusByKios = async (req, res) => {
  const { query } = req.query;
  const kiosId = req.params.id;

  if (!query) {
    return res.status(400).json({ message: 'Query pencarian wajib diisi' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM menu WHERE kios_id = $1 AND nama_menu ILIKE $2',
      [kiosId, `%${query}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAllMenu,
  addMenu,
  getMenuById,
  updateMenu,
  deleteMenu,
  getNewMenus,
  searchMenus,
  searchMenusByKios
};
