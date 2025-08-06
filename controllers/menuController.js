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
  const { nama_menu, deskripsi, harga } = req.body;
  const foto = req.file ? req.file.filename : null;

  try {
    const result = await pool.query(
      `INSERT INTO menu (nama_menu, deskripsi, harga, foto, penjual_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nama_menu, deskripsi, harga, foto, penjual_id]
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

// Update menu
const updateMenu = async (req, res) => {
  const penjualId = req.user.id;
  const menuId = req.params.id;
  const { nama_menu, harga, deskripsi } = req.body;
  const foto = req.file ? req.file.filename : null;

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
       SET nama_menu = $1, harga = $2, deskripsi = $3, foto = COALESCE($4, foto)
       WHERE id = $5 AND penjual_id = $6 RETURNING *`,
      [nama_menu, harga, deskripsi, foto, menuId, penjualId]
    );

    res.status(200).json({
      message: 'Menu berhasil diupdate',
      data: updatedMenu.rows[0],
    });
  } catch (error) {
    res.status(500).json({ message: 'Gagal update menu', error });
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

module.exports = {
  getAllMenu,
  addMenu,
  getMenuById,
  updateMenu,
  deleteMenu,
};
