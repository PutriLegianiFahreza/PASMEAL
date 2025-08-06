const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  Browsers
} = require('@whiskeysockets/baileys');

const P = require('pino');

// Inisialisasi store untuk menyimpan data session
const store = makeInMemoryStore({
  logger: P({ level: 'fatal' }).child({ stream: 'store' }),
});

store.readFromFile('./baileys_store.json');
setInterval(() => {
  store.writeToFile('./baileys_store.json');
}, 10_000);

let globalSock; // Simpan instance WhatsApp socket

// Fungsi utama untuk menghubungkan ke WhatsApp
const connectToWhatsApp = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: P({ level: 'fatal' }),
    browser: Browsers.macOS('PasMeal'),
  });

  globalSock = sock;

  store.bind(sock.ev);
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('🔁 Koneksi terputus. Coba sambung ulang:', shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp terhubung!');
    }
  });

  return sock;
};

// Fungsi bantu kirim pesan WA biasa
const sendWaMessage = async (phoneNumber, message) => {
  if (!globalSock) {
    throw new Error('❌ WhatsApp belum terhubung.');
  }
  const jid = phoneNumber.replace(/^0/, '62') + '@s.whatsapp.net';
  await globalSock.sendMessage(jid, { text: message });
};

// Fungsi bantu kirim pesan OTP ke nomor tertentu
const sendOtpMessage = async (phoneNumber, otpCode) => {
  const message = `🔐 Kode OTP kamu: *${otpCode}*\nJangan bagikan ke siapa pun ya!`;
  await sendWaMessage(phoneNumber, message);
};

// Fungsi untuk dapatkan koneksi WA dari file lain
const getWASocket = () => globalSock;

module.exports = {
  connectToWhatsApp,
  sendWaMessage,
  sendOtpMessage,
  getWASocket,
};
