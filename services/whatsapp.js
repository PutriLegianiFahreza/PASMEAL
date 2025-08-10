const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');

const { makeInMemoryStore } = require('@whiskeysockets/baileys');
const store = makeInMemoryStore({ logger: P({ level: 'silent' }) });

const STORE_FILE = './baileys_store.json';
if (fs.existsSync(STORE_FILE)) {
  store.readFromFile(STORE_FILE);
}
setInterval(() => {
  store.writeToFile(STORE_FILE);
}, 10_000);
process.on('exit', () => {
  store.writeToFile(STORE_FILE);
});

let globalSock;
let waReady = false; // status koneksi WA

const connectToWhatsApp = async () => {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: P({ level: 'silent' }),
      browser: Browsers.macOS('PasMeal'),
      keepAliveIntervalMs: 20000,
      printQRInTerminal: true
    });

    globalSock = sock;
    store.bind(sock.ev);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      const reason = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;

      if (qr) {
        console.log('📱 Scan QR untuk konek WA');
      }
      if (connection === 'open') {
        waReady = true;
        console.log('✅ WhatsApp terhubung & siap kirim pesan!');
      } else if (connection === 'close') {
        waReady = false;
        console.log(`🔌 Koneksi terputus (${reason}).`);
        if (shouldReconnect) {
          console.log('⏳ Mencoba reconnect dalam 20 detik...');
          setTimeout(connectToWhatsApp, 20000);
        }
      }
    });

    // Tangkap semua error biar server nggak mati
    sock.ev.on('error', (err) => {
      console.error('⚠️ Error WA:', err.message);
    });

    return sock;
  } catch (err) {
    console.error('❌ Gagal koneksi WA:', err.message);
    setTimeout(connectToWhatsApp, 20000);
  }
};

// Kirim pesan biasa
const sendWaMessage = async (phoneNumber, message) => {
  if (!waReady) {
    console.log('⚠️ WA belum siap. Pesan tidak terkirim.');
    return;
  }
  const jid = phoneNumber.replace(/^0/, '62') + '@s.whatsapp.net';
  try {
    await globalSock.sendMessage(jid, { text: message });
    console.log(`✅ Pesan terkirim ke ${phoneNumber}`);
  } catch (err) {
    console.error(`❌ Gagal kirim pesan ke ${phoneNumber}:`, err.message);
  }
};

// Kirim OTP
const sendOtpMessage = async (phoneNumber, otpCode) => {
  const message = `🔐 Kode OTP kamu: *${otpCode}*\nJangan bagikan ke siapa pun ya!`;
  await sendWaMessage(phoneNumber, message);
};

const getWASocket = () => globalSock;

module.exports = {
  connectToWhatsApp,
  sendWaMessage,
  sendOtpMessage,
  getWASocket
};
