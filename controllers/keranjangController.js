// controllers/keranjangController.js

const pool = require('../config/db');
const getGuestId = require('../utils/getGuestId');
const { formatKeranjang } = require('../utils/formatter');

// TAMBAH KERANJANG
const addToKeranjang = async (req, res) => {
  const guest_id = getGuestId(req);
  const { menu_id, jumlah = 1, catatan = '' } = req.body;

  if (!guest_id || !menu_id) {
    return res.status(400).json({ message: 'guest_id dan menu_id wajib dikirim' });
  }

  try {
    const menuResult = await pool.query(
      'SELECT harga, kios_id, foto_menu, nama_menu FROM menu WHERE id = $1',
      [menu_id]
    );
    if (menuResult.rowCount === 0) return res.status(404).json({ message: 'Menu tidak ditemukan' });

    const { harga, kios_id, foto_menu, nama_menu } = menuResult.rows[0];

    const existingCart = await pool.query(
      'SELECT DISTINCT kios_id FROM keranjang WHERE guest_id = $1',
      [guest_id]
    );

    if (existingCart.rows.length > 0 && existingCart.rows[0].kios_id !== kios_id) {
      return res.status(409).json({
        message: 'Anda memiliki item dari kios lain di keranjang. Kosongkan keranjang untuk melanjutkan.',
        error_code: 'DIFFERENT_KIOS'
      });
    }

    const existing = await pool.query(
      'SELECT * FROM keranjang WHERE guest_id = $1 AND menu_id = $2',
      [guest_id, menu_id]
    );

    let item;
    if (existing.rows.length > 0) {
      const newJumlah = existing.rows[0].jumlah + jumlah;
      const total_harga = harga * newJumlah;

      const updated = await pool.query(
        `UPDATE keranjang 
         SET jumlah = $1, catatan = $2, total_harga = $3 
         WHERE guest_id = $4 AND menu_id = $5 
         RETURNING *`,
        [newJumlah, catatan || existing.rows[0].catatan, total_harga, guest_id, menu_id]
      );
      item = updated.rows[0];
    } else {
      const total_harga = harga * jumlah;

      const inserted = await pool.query(
        `INSERT INTO keranjang (guest_id, kios_id, menu_id, jumlah, catatan, total_harga)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [guest_id, kios_id, menu_id, jumlah, catatan, total_harga]
      );
      item = inserted.rows[0];
    }

    const responseItem = {
      ...item,
      nama_menu,
      harga,
      foto_menu,
      subtotal: harga * item.jumlah,
    };

    res.status(existing.rows.length > 0 ? 200 : 201).json({
      message: existing.rows.length > 0 ? 'Jumlah diperbarui' : 'Ditambahkan ke keranjang',
      item: formatKeranjang(responseItem)
    });
  } catch (err) {
    console.error('addToKeranjang error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// AMBIL KERANJANG
const getKeranjang = async (req, res) => {
  const guest_id = getGuestId(req);
  if (!guest_id) return res.status(400).json({ message: 'guest_id wajib dikirim (query/header/body)' });

  try {
    const result = await pool.query(`
      SELECT k.id, k.menu_id, k.kios_id, m.nama_menu, m.harga, m.foto_menu, 
             k.jumlah, k.catatan, (m.harga * k.jumlah) AS subtotal
      FROM keranjang k
      JOIN menu m ON k.menu_id = m.id
      WHERE k.guest_id = $1
      ORDER BY k.id DESC
    `, [guest_id]);

    const items = result.rows.map(row => formatKeranjang(row));
    const total_harga = items.reduce((s, it) => s + Number(it.subtotal || 0), 0);
    const kios_id = items.length > 0 ? items[0].kios_id : null;

    res.setHeader('X-Buyer-Id', guest_id);
    res.json({ kios_id, items, total_harga });
  } catch (err) {
    console.error('getKeranjang error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// UPDATE ITEM KERANJANG
const updateKeranjangItem = async (req, res) => {
  const guest_id = getGuestId(req);
  const { id } = req.params;
  const { jumlah, catatan } = req.body;

  if (!guest_id) return res.status(400).json({ message: 'guest_id wajib dikirim' });

  try {
    const check = await pool.query('SELECT * FROM keranjang WHERE id = $1 AND guest_id = $2', [id, guest_id]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Item tidak ditemukan' });

    const newJumlah = jumlah ?? check.rows[0].jumlah;

    if (newJumlah <= 0) {
      await pool.query('DELETE FROM keranjang WHERE id = $1 AND guest_id = $2', [id, guest_id]);
      return res.json({ message: 'Item dihapus karena jumlah = 0' });
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

    const responseItem = {
      ...updated.rows[0],
      nama_menu,
      harga,
      foto_menu,
      subtotal: total_harga,
    };

    res.json({
      message: 'Item diperbarui',
      item: formatKeranjang(responseItem)
    });
  } catch (err) {
    console.error('updateKeranjangItem error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// HAPUS ITEM KERANJANG
const removeFromKeranjang = async (req, res) => {
  const guest_id = getGuestId(req);
  const { id } = req.params;

  if (!guest_id) return res.status(400).json({ message: 'guest_id wajib dikirim' });

  try {
    const check = await pool.query(
      `SELECT k.*, m.nama_menu, m.harga, m.foto_menu
       FROM keranjang k
       JOIN menu m ON k.menu_id = m.id
       WHERE k.id = $1 AND k.guest_id = $2`,
      [id, guest_id]
    );

    if (check.rows.length === 0) return res.status(404).json({ message: 'Item tidak ditemukan' });

    await pool.query(`DELETE FROM keranjang WHERE id = $1 AND guest_id = $2`, [id, guest_id]);

    const item = formatKeranjang(check.rows[0]);

    res.json({ message: 'Item dihapus', item });
  } catch (err) {
    console.error('removeFromKeranjang error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

module.exports = {
  addToKeranjang,
  getKeranjang,
  updateKeranjangItem,
  removeFromKeranjang
};
