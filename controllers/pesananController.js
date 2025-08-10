const pool = require('../config/db');
const getGuestId = require('../utils/getGuestId');

// Buat pesanan dari keranjang guest
const buatPesanan = async (req, res) => {
  // ambil guest_id dari body/header/query (lebih aman: body)
  const guest_id = req.body.guest_id || getGuestId(req);
  const { tipe_pengantaran, nama_pemesan, no_hp, catatan = '', diantar_ke } = req.body;

  if (!guest_id || !tipe_pengantaran || !nama_pemesan || !no_hp) {
    return res.status(400).json({ message: 'guest_id, tipe_pengantaran, nama_pemesan, no_hp wajib diisi' });
  }

  // validasi: kalau diantar, diantar_ke wajib
  if (tipe_pengantaran === 'diantar' && (!diantar_ke || diantar_ke.trim() === '')) {
    return res.status(400).json({ message: 'diantar_ke wajib diisi jika tipe_pengantaran = diantar' });
  }

  try {
    const k = await pool.query(`
      SELECT k.id AS keranjang_id, k.menu_id, k.jumlah, m.nama_menu, m.harga, m.foto_menu, m.kios_id, ki.nama_kios
      FROM keranjang k
      JOIN menu m ON k.menu_id = m.id
      LEFT JOIN kios ki ON m.kios_id = ki.id
      WHERE k.guest_id = $1
    `, [guest_id]);

    if (k.rows.length === 0) {
      return res.status(400).json({ message: 'Keranjang kosong' });
    }

    const items = k.rows;
    const total_harga = items.reduce((s, it) => s + Number(it.harga) * Number(it.jumlah), 0);

    // simpan pesanan utama
    const pesananRes = await pool.query(`
      INSERT INTO pesanan (guest_id, tipe_pengantaran, nama_pemesan, no_hp, catatan, diantar_ke, total_harga)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at
    `, [guest_id, tipe_pengantaran, nama_pemesan, no_hp, catatan, diantar_ke || null, total_harga]);

    const pesananId = pesananRes.rows[0].id;

    // simpan detail
    const insertDetailText = `
      INSERT INTO pesanan_detail (pesanan_id, menu_id, nama_menu, harga, foto_menu, jumlah, subtotal)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `;
    for (const it of items) {
      await pool.query(insertDetailText, [
        pesananId,
        it.menu_id,
        it.nama_menu,
        it.harga,
        it.foto_menu,
        it.jumlah,
        Number(it.harga) * Number(it.jumlah)
      ]);
    }

    // hapus keranjang guest
    await pool.query('DELETE FROM keranjang WHERE guest_id = $1', [guest_id]);

    // respon detail ringkas
    res.status(201).json({
      message: 'Pesanan berhasil dibuat',
      pesanan_id: pesananId,
      total_harga,
      created_at: pesananRes.rows[0].created_at
    });
  } catch (err) {
    console.error('buatPesanan error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// ambil daftar pesanan berdasarkan guest_id
const getPesananByGuest = async (req, res) => {
  const guest_id = req.query.guest_id || getGuestId(req);
  if (!guest_id) return res.status(400).json({ message: 'guest_id wajib diisi (query/header/body)' });

  try {
    const result = await pool.query(`
      SELECT id, tipe_pengantaran, nama_pemesan, no_hp, diantar_ke, total_harga, status, created_at
      FROM pesanan
      WHERE guest_id = $1
      ORDER BY created_at DESC
    `, [guest_id]);

    res.json(result.rows);
  } catch (err) {
    console.error('getPesananByGuest error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

// ambil detail pesanan by id
const getDetailPesanan = async (req, res) => {
  const pesananId = req.params.id;
  try {
    const p = await pool.query('SELECT * FROM pesanan WHERE id = $1', [pesananId]);
    if (p.rows.length === 0) return res.status(404).json({ message: 'Pesanan tidak ditemukan' });

    const details = await pool.query('SELECT * FROM pesanan_detail WHERE pesanan_id = $1', [pesananId]);
    res.json({ ...p.rows[0], items: details.rows });
  } catch (err) {
    console.error('getDetailPesanan error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

module.exports = { buatPesanan, getPesananByGuest, getDetailPesanan };
