const pool = require('../config/db');
const path = require('path');

// Ambil semua menu (penjual)
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

//TAMBAH MENU(penjual)
const addMenu = async (req, res) => {
  const penjual_id = req.user.id;
  const kios_id = req.user.kios_id;
  const { nama_menu, deskripsi, harga, estimasi_menit, status_tersedia } = req.body;
  const foto_menu = req.file ? req.file.filename : null;

  console.log('req.file:', req.file); 

  try {
    const result = await pool.query(
      `INSERT INTO menu 
       (nama_menu, deskripsi, harga, foto_menu, penjual_id, kios_id, estimasi_menit, status_tersedia)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
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

    res.status(201).json({
      message: 'Menu berhasil ditambahkan',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Gagal tambah menu:', error);
    res.status(500).json({ message: 'Terjadi kesalahan server', error: error.message });
  }
};

//UPDATE MENU(penjual)
const updateMenu = async (req, res) => {
  const penjual_id = req.user.id;
  const menuId = req.params.id;
  const allowedFields = ['nama_menu','harga','deskripsi','estimasi_menit','status_tersedia'];
  const updates = [];
  const values = [];

  allowedFields.forEach((field, index) => {
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
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Menu tidak ditemukan atau bukan milik kamu' });
    }
    res.status(200).json({
      message: 'Menu berhasil diupdate',
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Terjadi kesalahan server', error: error.message });
  }
};

// Ambil detail 1 menu (penjual)
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

// Hapus menu(penjual)
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

// Ambil 5 menu terbaru(pembeli)
const getNewMenus = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM menu ORDER BY created_at DESC LIMIT 5'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cari menu berdasarkan nama (pembeli)
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

// Cari menu berdasarkan nama di kios tertentu(pembeli)
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

//nampilin detail menu (pembeli)
const getMenuByIdForBuyer = async (req, res) => {
  const menuId = req.params.id;

  try {
    const result = await pool.query(
      `SELECT foto_menu, nama_menu, deskripsi, harga 
       FROM menu 
       WHERE id = $1`,
      [menuId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Menu tidak ditemukan' });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Gagal mengambil detail menu', error });
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
  searchMenusByKios,
  getMenuByIdForBuyer
};
