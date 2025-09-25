const midtransClient = require('midtrans-client');
const pool = require('../config/db');
const { notifyPenjual } = require('../controllers/pesananController');

// Inisialisasi Snap 
const snap = new midtransClient.Snap({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

const httpErr = (status, message) => {
  const e = new Error(message);
  e.status = status;
  return e;
};

// CREATE TRANSACTION (service)
async function createTransactionService(req) {
  try {
    const { pesanan_id, guest_id, items, total_harga } = req.body;

    if (!guest_id) throw httpErr(400, "guest_id wajib diisi");

    let pesananId = pesanan_id;

    let total = total_harga;
    if (!total && Array.isArray(items)) {
      total = items.reduce((sum, item) => (
        sum + (parseInt(item.price, 10) || 0) * (parseInt(item.qty, 10) || 0)
      ), 0);
    }

    if (!total || total <= 0) throw httpErr(400, "total_harga harus positif");

    if (!pesananId) {
      const insertQuery = `
        INSERT INTO pesanan (guest_id, status, total_harga)
        VALUES ($1,$2,$3) RETURNING id`;
      const result = await pool.query(insertQuery, [guest_id, 'pending', total]);
      pesananId = result.rows[0].id;
    } else {
      const result = await pool.query(
        `SELECT total_harga FROM pesanan WHERE id=$1`,
        [pesananId]
      );
      if (result.rows.length === 0) throw httpErr(404, "Pesanan tidak ditemukan");
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

    return {
      status: 200,
      body: {
        order_id: orderId,
        token: transaction.token,
        redirect_url: transaction.redirect_url
      }
    };
  } catch (err) {
    if (err.status) throw err;
    console.error(err);
    throw httpErr(500, "Gagal membuat transaksi");
  }
}

// HANDLE MIDTRANS NOTIFICATION (service)
async function handleNotificationService(req) {
  try {
    const notif = req.body;
    console.log("[MIDTRANS NOTIF RECEIVED]", notif);

    const orderId = notif.order_id;
    const transactionStatus = notif.transaction_status;

    const pesananId = parseInt(orderId.split('-')[1], 10);
    console.log("[INFO] Pesanan ID:", pesananId);

    let statusUpdate;
    if (transactionStatus === 'settlement') {
      statusUpdate = 'paid';
    } else if (transactionStatus === 'pending') {
      statusUpdate = 'pending';
    } else {
      statusUpdate = 'failed';
    }
    console.log("[INFO] Status update:", statusUpdate);

    const updateQuery = `
      UPDATE pesanan 
      SET status = $1::text, 
          payment_type = $2, 
          payment_details = $3,
          paid_at = CASE 
                      WHEN $1::text = 'paid' THEN NOW() 
                      ELSE paid_at 
                    END
      WHERE id = $4
      RETURNING *;
    `;
    const updateResult = await pool.query(updateQuery, [
      statusUpdate,
      notif.payment_type,
      JSON.stringify(
        notif.va_numbers ||
        notif.permata_va_number ||
        notif.payment_details ||
        null
      ),
      pesananId
    ]);
    console.log("[INFO] Pesanan updated:", updateResult.rows[0]);

    if (statusUpdate === 'paid') {
      const pesananData = await pool.query(
        `SELECT m.kios_id, m.nama_menu
         FROM pesanan_detail pd
         JOIN menu m ON pd.menu_id = m.id
         WHERE pd.pesanan_id=$1`,
        [pesananId]
      );

      if (pesananData.rows.length === 0) {
        console.log("[WARN] Tidak ditemukan kios_id untuk pesanan", pesananId);
      } else {
        for (const row of pesananData.rows) {
          console.log("[INFO] Mengirim WA ke kios_id:", row.kios_id, "menu:", row.nama_menu);
          try {
            await notifyPenjual(row.kios_id, pesananId);
            console.log("[SUCCESS] WA dikirim ke kios_id:", row.kios_id);
          } catch (err) {
            console.error("[ERROR] Gagal kirim WA ke kios_id:", row.kios_id, err);
          }
        }
      }
    }

    return { status: 200, body: { message: "Notifikasi diproses" } };
  } catch (err) {
    if (err.status) throw err;
    console.error("[NOTIFICATION ERROR]", err);
    throw httpErr(500, "Gagal memproses notifikasi");
  }
}

module.exports = {
  createTransactionService,
  handleNotificationService,
};
