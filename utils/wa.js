const { getWASocket } = require('../services/whatsapp');

// Fungsi umum untuk kirim pesan bebas ke WhatsApp
async function sendWhatsApp(no_hp, message) {
  const sock = getWASocket();

  if (!sock) {
    throw new Error('❌ WhatsApp belum terhubung.');
  }

  const nomorWA = no_hp.replace(/^0/, '62') + '@s.whatsapp.net';
  try {
    await sock.sendMessage(nomorWA, { text: message });
    console.log(`✅ Pesan WA terkirim ke ${no_hp}`);
  } catch (err) {
    console.error(`❌ Gagal kirim pesan WA ke ${no_hp}:`, err);
    throw err; // lempar supaya caller tahu
  }
}

// Fungsi khusus untuk kirim OTP
async function sendWhatsAppOTP(no_hp, otp_code) {
  const pesan = `🔐 Kode OTP kamu: *${otp_code}*\nJangan bagikan ke siapa pun ya!`;
  await sendWhatsApp(no_hp, pesan);
}

module.exports = {
  sendWhatsApp,
  sendWhatsAppOTP
};
