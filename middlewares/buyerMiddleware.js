const { v4: uuidv4 } = require('uuid');

const buyerMiddleware = (req, res, next) => {
  let buyerId = req.headers['x-buyer-id'];

  // Kalau belum ada buyerId dari frontend, generate baru
  if (!buyerId) {
    buyerId = uuidv4();
    console.log(`🆕 Buyer ID baru dibuat: ${buyerId}`);
  }

  req.buyerId = buyerId;

  // Set buyerId di header response supaya frontend bisa simpan
  res.setHeader('X-Buyer-Id', buyerId);

  next();
};

module.exports = buyerMiddleware;
