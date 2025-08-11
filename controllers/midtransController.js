const midtransClient = require('midtrans-client');
const pool = require('../config/db');

// Konfigurasi Snap Midtrans
const snap = new midtransClient.Snap({
    isProduction: false,
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// CREATE TRANSACTION
const createTransaction = async (req, res) => {
    try {
        let { guest_id, items, total_harga } = req.body;

        // Hitung total harga jika items ada
        if (!total_harga && Array.isArray(items)) {
            total_harga = items.reduce((sum, item) => {
                const price = parseInt(item.price, 10) || 0;
                const qty = parseInt(item.qty, 10) || 0;
                return sum + (price * qty);
            }, 0);
        }

        if (!guest_id || total_harga === undefined) {
            return res.status(400).json({ message: "guest_id dan total_harga wajib diisi" });
        }

        total_harga = parseInt(total_harga, 10);
        if (isNaN(total_harga) || total_harga <= 0) {
            return res.status(400).json({ message: "total_harga harus berupa angka positif" });
        }

        // 1. Insert pesanan
        const insertQuery = `
        INSERT INTO pesanan (guest_id, status, total_harga)
         VALUES ($1, $2, $3) RETURNING id;
          `;
        const result = await pool.query(insertQuery, [
        guest_id,
        'pending',
         total_harga
      ]);

        const pesananId = result.rows[0].id;

        // 2. Buat order_id unik
        const orderId = `ORDER-${pesananId}-${Date.now()}`;

        // 3. Setup parameter Midtrans
        const parameter = {
            transaction_details: {
                order_id: orderId,
                gross_amount: total_harga
            },
            credit_card: { secure: true },
            customer_details: {
                first_name: `Guest-${guest_id}`
            }
        };

        // 4. Buat transaksi di Midtrans
        const transaction = await snap.createTransaction(parameter);

        // 5. Simpan order_id & snap_token ke DB
        await pool.query(
            `UPDATE pesanan SET order_id = $1, snap_token = $2 WHERE id = $3`,
            [orderId, transaction.token, pesananId]
        );

        res.json({
            order_id: orderId,
            token: transaction.token,
            redirect_url: transaction.redirect_url
        });

    } catch (error) {
        console.error("[CREATE TRANSACTION ERROR]", error);
        res.status(500).json({ message: "Gagal membuat transaksi" });
    }
};

// HANDLE NOTIFICATION
const handleNotification = async (req, res) => {
    try {
        const notification = req.body;

        console.log("=== WEBHOOK MASUK ===");
        console.log(JSON.stringify(notification, null, 2)); // log semua isi webhook

        const orderId = notification.order_id; // ORDER-{id}-{timestamp}
        const transactionStatus = notification.transaction_status;
        const paymentType = notification.payment_type || null;
        const paymentDetails = notification.va_numbers || notification.permata_va_number || notification.payment_details || null;

        // Ambil id pesanan dari orderId
        const pesananId = parseInt(orderId.split('-')[1], 10);

        let statusUpdate;
        if (transactionStatus === 'settlement') {
            statusUpdate = 'paid';
        } else if (transactionStatus === 'pending') {
            statusUpdate = 'pending';
        } else {
            statusUpdate = 'failed';
        }

        // Update status + payment info di DB
        await pool.query(
            `UPDATE pesanan 
             SET status = $1, payment_type = $2, payment_details = $3
             WHERE id = $4`,
            [statusUpdate, paymentType, paymentDetails ? JSON.stringify(paymentDetails) : null, pesananId]
        );

        console.log(`✅ Pesanan ${pesananId} diupdate: status=${statusUpdate}, type=${paymentType}`);

        res.json({ message: "Notifikasi diproses" });

    } catch (error) {
        console.error("[NOTIFICATION ERROR]", error);
        res.status(500).json({ message: "Gagal memproses notifikasi" });
    }
};

module.exports = {
    createTransaction,
    handleNotification
};
