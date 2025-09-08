// middlewares/verifyMidtransSignature.js
const crypto = require('crypto');

function sha512(s) {
  return crypto.createHash('sha512').update(s).digest('hex');
}

module.exports = function verifyMidtransSignature(req, res, next) {
  try {
    const { order_id, status_code, gross_amount, signature_key } = req.body || {};
    const serverKey = (process.env.MIDTRANS_SERVER_KEY || '').trim();

    const oid = String(order_id ?? '');
    const sc  = String(status_code ?? '');
    const gaRaw = String(gross_amount ?? '');

    // kandidat gross_amount yang umum dipakai Midtrans
    const candidates = new Set([gaRaw]);
    if (/^\d+(\.\d+)?$/.test(gaRaw)) {
      candidates.add(Number(gaRaw).toFixed(2)); // "20000" -> "20000.00"
    }

    const raws = [...candidates].map(ga => `${oid}${sc}${ga}${serverKey}`);
    const expected = raws.map(sha512);
    const provided = String(signature_key || '').toLowerCase();
    const ok = expected.some(x => x === provided);

    if (!ok) {
      // ⇩⇩ kirim info debug di non-prod ⇩⇩
      if (process.env.NODE_ENV !== 'production') {
        return res.status(401).json({
          message: 'Invalid signature',
          debug: {
            inputs: { order_id: oid, status_code: sc, gross_amount: gaRaw },
            raws,                // string yang server hash
            expected,            // hash yang server hasilkan dari tiap kandidat
            provided             // hash yang datang dari Postman
          }
        });
      }
      return res.status(401).json({ message: 'Invalid signature' });
    }
    return next();
  } catch (e) {
    return next(e);
  }
};
