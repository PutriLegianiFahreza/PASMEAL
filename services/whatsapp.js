const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  Browsers
} = require('@whiskeysockets/baileys');

const P = require('pino');
const fs = require('fs');

// Inisialisasi store untuk menyimpan data session
const store = makeInMemoryStore({
  logger: P({ level: 'silent' }) // matiin log biar gak spam
});

// Load store dari file kalau ada
const STORE_FILE = './baileys_store.json';
if (fs.existsSync(STORE_FILE)) {
  store.readFromFile(STORE_FILE);
}
setInterval(() => {
  store.writeToFile(STORE_FILE);
}, 10_000);

let globalSock; // Simpan instance socket WA

// Fungsi utama konek ke WhatsApp
const connectToWhatsApp = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: P({ level: 'silent' }),
    browser: Browsers.macOS('PasMeal')
  });

  globalSock = sock;

  store.bind(sock.ev);
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('🔌 Koneksi terputus. Reconnect:', shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp terhubung!');
    }
  });

  return sock;
};

// Kirim pesan teks biasa
const sendWaMessage = async (phoneNumber, message) => {
  if (!globalSock) {
    throw new Error('❌ WhatsApp belum terhubung.');
  }
  const jid = phoneNumber.replace(/^0/, '62') + '@s.whatsapp.net';
  await globalSock.sendMessage(jid, { text: message });
};

// Kirim pesan OTP
const sendOtpMessage = async (phoneNumber, otpCode) => {
  const message = `🔐 Kode OTP kamu: *${otpCode}*\nJangan bagikan ke siapa pun ya!`;
  await sendWaMessage(phoneNumber, message);
};

// Getter socket
const getWASocket = () => globalSock;

module.exports = {
  connectToWhatsApp,
  sendWaMessage,
  sendOtpMessage,
  getWASocket
};
