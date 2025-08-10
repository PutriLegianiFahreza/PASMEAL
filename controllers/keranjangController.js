const pool = require('../config/db');
const getGuestId = require('../utils/getGuestId');

// Tambah atau tambah jumlah jika sudah ada
const addToKeranjang = async (req, res) => {
  const guest_id = getGuestId(req);
  const { menu_id, jumlah = 1, catatan = '' } = req.body;

  if (!guest_id || !menu_id) {
    return res.status(400).json({ message: 'guest_id dan menu_id wajib dikirim' });
  }

  try {
    const existing = await pool.query(
      'SELECT * FROM keranjang WHERE guest_id = $1 AND menu_id = $2',
      [guest_id, menu_id]
    );

    let item;
    if (existing.rows.length > 0) {
      const updated = await pool.query(
        'UPDATE keranjang SET jumlah = jumlah + $1, catatan = $3 WHERE guest_id = $2 AND menu_id = $4 RETURNING *',
        [jumlah, guest_id, catatan || existing.rows[0].catatan, menu_id]
      );
      item = updated.rows[0];
    } else {
      const inserted = await pool.query(
        `INSERT INTO keranjang (guest_id, menu_id, jumlah, catatan)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [guest_id, menu_id, jumlah, catatan]
      );
      item = inserted.rows[0];
    }

    // Ambil harga untuk hitung total
    const hargaResult = await pool.query('SELECT harga FROM menu WHERE id = $1', [menu_id]);
    const harga = hargaResult.rows[0]?.harga || 0;
    const total_harga = harga * item.jumlah;

    res.status(existing.rows.length > 0 ? 200 : 201).json({
      message: existing.rows.length > 0 ? 'Jumlah diperbarui' : 'Ditambahkan ke keranjang',
      item: {
        ...item,
        total_harga
      }
    });
  } catch (err) {
    console.error('addToKeranjang error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// Ambil semua item keranjang untuk guest_id
const getKeranjang = async (req, res) => {
  const guest_id = getGuestId(req);
  if (!guest_id) {
    return res.status(400).json({ message: 'guest_id wajib dikirim (query/header/body)' });
  }

  try {
    const result = await pool.query(`
      SELECT k.id, k.menu_id, m.nama_menu, m.harga, m.foto_menu, k.jumlah, k.catatan,
             (m.harga * k.jumlah) AS subtotal
      FROM keranjang k
      JOIN menu m ON k.menu_id = m.id
      WHERE k.guest_id = $1
      ORDER BY k.id DESC
    `, [guest_id]);

    const items = result.rows;
    const total_harga = items.reduce((s, it) => s + Number(it.subtotal || 0), 0);

    res.setHeader('X-Buyer-Id', guest_id);
    res.json({ items, total_harga });
  } catch (err) {
    console.error('getKeranjang error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};


// Update jumlah / catatan item
const updateKeranjangItem = async (req, res) => {
  const guest_id = getGuestId(req);
  const { id } = req.params;
  const { jumlah, catatan } = req.body;

  if (!guest_id) return res.status(400).json({ message: 'guest_id wajib dikirim' });

  try {
    const check = await pool.query('SELECT * FROM keranjang WHERE id = $1 AND guest_id = $2', [id, guest_id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Item tidak ditemukan' });
    }

    // Ambil jumlah baru (pakai yang dikirim atau tetap)
    const newJumlah = jumlah ?? check.rows[0].jumlah;

    // Update jumlah & catatan
    const updated = await pool.query(
      `UPDATE keranjang
       SET jumlah = $1, catatan = COALESCE($2, catatan)
       WHERE id = $3 AND guest_id = $4
       RETURNING *`,
      [newJumlah, catatan, id, guest_id]
    );

    const item = updated.rows[0];

    // Ambil harga untuk hitung total_harga
    const hargaResult = await pool.query('SELECT harga FROM menu WHERE id = $1', [item.menu_id]);
    const harga = hargaResult.rows[0]?.harga || 0;
    const total_harga = harga * item.jumlah;

    res.json({
      message: 'Item diperbarui',
      item: {
        ...item,
        total_harga
      }
    });
  } catch (err) {
    console.error('updateKeranjangItem error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// Hapus item keranjang
const removeFromKeranjang = async (req, res) => {
  const guest_id = getGuestId(req);
  const { id } = req.params;

  if (!guest_id) return res.status(400).json({ message: 'guest_id wajib dikirim' });

  try {
    const del = await pool.query('DELETE FROM keranjang WHERE id = $1 AND guest_id = $2 RETURNING *', [id, guest_id]);
    if (del.rowCount === 0) return res.status(404).json({ message: 'Item tidak ditemukan' });
    res.json({ message: 'Item dihapus', item: del.rows[0] });
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
