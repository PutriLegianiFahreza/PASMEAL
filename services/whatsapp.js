const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

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

// Override console.log untuk filter pesan tertentu agar gak muncul
const originalConsoleLog = console.log;
console.log = (...args) => {
  const msg = args.join(' ');
  if (
    msg.includes('Closing session') ||
    msg.includes('Closing open session')
  ) {
    return;
  }
  originalConsoleLog(...args);
};

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

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const reason = lastDisconnect?.error?.output?.statusCode;

      if (qr) {
        console.log('Scan QR untuk konek WA:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        waReady = true;
        console.log('WhatsApp terhubung & siap kirim pesan!');
      } else if (connection === 'close') {
        waReady = false;
        console.log(`Koneksi terputus (${reason}).`);

        if (reason === DisconnectReason.loggedOut) {
          console.log('WhatsApp sudah logout, silakan scan ulang QR untuk login ulang!');
        } else {
          console.log('Mencoba reconnect dalam 20 detik...');
          setTimeout(connectToWhatsApp, 20000);
        }
      }
    });

    sock.ev.on('error', (err) => {
      console.error('Error WA:', err.message);
    });

    return sock;
  } catch (err) {
    console.error('Gagal koneksi WA:', err.message);
    setTimeout(connectToWhatsApp, 20000);
  }
};

const sendWaMessage = async (phoneNumber, message) => {
  if (!waReady) {
    console.log('WA belum siap. Pesan tidak terkirim.');
    return false;
  }
  const jid = phoneNumber.replace(/^0/, '62') + '@s.whatsapp.net';
  try {
    await globalSock.sendMessage(jid, { text: message });
    console.log(`Pesan terkirim ke ${phoneNumber}`);
    return true;
  } catch (err) {
    console.error(`Gagal kirim pesan ke ${phoneNumber}:`, err.message);
    return false;
  }
};

const sendOtpMessage = async (phoneNumber, otpCode) => {
  console.log(`Mengirim OTP ke ${phoneNumber} dengan kode: ${otpCode}`);
  const message = `🔐 Kode OTP kamu: *${otpCode}*\nJangan bagikan ke siapa pun ya!`;
  return await sendWaMessage(phoneNumber, message);
};

const getWASocket = () => globalSock;

module.exports = {
  connectToWhatsApp,
  sendWaMessage,
  sendOtpMessage,
  getWASocket
};
