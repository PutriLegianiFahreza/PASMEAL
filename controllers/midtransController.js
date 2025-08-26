const midtransClient = require('midtrans-client');
const pool = require('../config/db');
const { notifyPenjual } = require('./pesananController');

// Konfigurasi Midtrans Snap
const snap = new midtransClient.Snap({
    isProduction: false,
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// CREATE TRANSACTION
const createTransaction = async (req, res) => {
    try {
        const { pesanan_id, guest_id, items, total_harga } = req.body;

        if (!guest_id) return res.status(400).json({ message: "guest_id wajib diisi" });

        let pesananId = pesanan_id;

        let total = total_harga;
        if (!total && Array.isArray(items)) {
            total = items.reduce((sum, item) => sum + (parseInt(item.price, 10) || 0) * (parseInt(item.qty, 10) || 0), 0);
        }

        if (!total || total <= 0) return res.status(400).json({ message: "total_harga harus positif" });

        if (!pesananId) {
            const insertQuery = `INSERT INTO pesanan (guest_id, status, total_harga) VALUES ($1,$2,$3) RETURNING id`;
            const result = await pool.query(insertQuery, [guest_id, 'pending', total]);
            pesananId = result.rows[0].id;
        } else {
            const result = await pool.query(`SELECT total_harga FROM pesanan WHERE id=$1`, [pesananId]);
            if (result.rows.length === 0) return res.status(404).json({ message: "Pesanan tidak ditemukan" });
            total = result.rows[0].total_harga;
        }

        const orderId = `ORDER-${pesananId}-${Date.now()}`;

        const parameter = {
            transaction_details: { order_id: orderId, gross_amount: total },
            credit_card: { secure: true },
            customer_details: { first_name: `Guest-${guest_id}` }
        };

        const transaction = await snap.createTransaction(parameter);

        await pool.query(
            `UPDATE pesanan SET order_id=$1, snap_token=$2 WHERE id=$3`,
            [orderId, transaction.token, pesananId]
        );

        res.json({ order_id: orderId, token: transaction.token, redirect_url: transaction.redirect_url });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Gagal membuat transaksi" });
    }
};

// HANDLE MIDTRANS NOTIFICATION

const handleNotification = async (req, res) => {
  const notification = req.body;
  const orderId = notification.order_id;
  const transactionStatus = notification.transaction_status;

  try {
    let statusUpdate = 'pending';

    if (transactionStatus === 'settlement' || transactionStatus === 'capture') {
      statusUpdate = 'paid';
    } else if (transactionStatus === 'pending') {
      statusUpdate = 'pending';
    } else {
      statusUpdate = 'failed';
    }

    // update status di database
    await pool.query(
      'UPDATE pesanan SET status = $1 WHERE id = $2',
      [statusUpdate, orderId]
    );

    // kirim WA hanya kalau statusnya sudah paid
    if (statusUpdate === 'paid') {
      const { rows } = await pool.query(
        `SELECT p.id, p.nama_pembeli, p.no_meja, k.nama_kios, k.no_hp
         FROM pesanan p
         JOIN kios k ON p.kios_id = k.id
         WHERE p.id = $1`,
        [orderId]
      );

      if (rows.length > 0) {
        const pesanan = rows[0];
        await notifyPenjual(pesanan);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in notification handler:', error);
    res.status(500).json({ success: false });
  }
};


module.exports = { 
    createTransaction, 
    handleNotification 
};
