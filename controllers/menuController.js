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
const updateMenu = async (req, res) => {
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

  try {
    // 1. Ambil data menu lama dari database
    const result = await pool.query('SELECT * FROM menu WHERE id = $1 AND penjual_id = $2', [id, penjual_id]);

    if (result.rows.length === 0) {
      // Jika menu tidak ditemukan, hapus file yang mungkin terlanjur diunggah
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ message: 'Menu tidak ditemukan' });
    }

    const oldMenu = result.rows[0];

    // Siapkan variabel untuk menyimpan informasi foto
    // Secara default, gunakan foto yang lama
    let newFotoUrl = oldMenu.foto_menu;
    let newFotoPublicId = oldMenu.foto_public_id;

    // 2. Cek apakah ada file baru yang diunggah (`req.file` ada berkat Multer)
    if (req.file) {
      try {
        // Unggah file baru yang ada di `req.file.path` ke Cloudinary
        const resultUpload = await cloudinary.uploader.upload(req.file.path);
        
        // Simpan URL dan public_id dari foto yang baru
        newFotoUrl = resultUpload.secure_url;
        newFotoPublicId = resultUpload.public_id;

        // Setelah berhasil diunggah ke Cloudinary, hapus file sementara dari server Anda
        fs.unlinkSync(req.file.path);

        // Jika ada foto lama, hapus dari Cloudinary untuk menghemat ruang
        if (oldMenu.foto_public_id) {
          await cloudinary.uploader.destroy(oldMenu.foto_public_id);
        }
      } catch (uploadError) {
        console.error('Gagal saat mengunggah ke Cloudinary:', uploadError);
        // Hapus file sementara jika unggahan gagal
        fs.unlinkSync(req.file.path);
        return res.status(500).json({ message: 'Gagal memperbarui gambar' });
      }
    }

    // 3. Siapkan data yang akan di-update
    // Gunakan data baru dari req.body, atau data lama jika tidak ada yang baru
    const updatedData = {
      nama_menu: nama_menu ?? oldMenu.nama_menu,
      deskripsi: deskripsi ?? oldMenu.deskripsi,
      harga: harga ?? oldMenu.harga,
      status_tersedia: status_tersedia ?? oldMenu.status_tersedia,
      kios_id: kios_id ?? oldMenu.kios_id,
      estimasi_menit: estimasi_menit ?? oldMenu.estimasi_menit,
    };

    // 4. Update data ke database dengan informasi foto yang sudah final
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
        newFotoUrl, // URL foto baru (atau lama jika tidak diubah)
        updatedData.status_tersedia,
        updatedData.kios_id,
        updatedData.estimasi_menit,
        newFotoPublicId, // Public ID baru (atau lama jika tidak diubah)
        id,
        penjual_id
      ]
    );

    res.json({ message: 'Menu berhasil diperbarui', menu: updated.rows[0] });

  } catch (err) {
    console.error(err);
    // Penanganan error umum, hapus file sementara jika ada
    if (req.file) {
        fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Terjadi kesalahan server' });
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
