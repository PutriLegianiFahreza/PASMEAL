const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const serverless = require('serverless-http');
const path = require('path');

// Load env variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Debug logger untuk request masuk
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
});

// Routes
const authRoutes = require('./routes/authRoutes');
const kiosRoutes = require('./routes/kiosRoutes');     
const menuRoutes = require('./routes/menuRoutes');    
const dashboardRoutes = require('./routes/dashboardRoutes');
const searchRoutes = require('./routes/searchRoutes'); 
const keranjangRoutes = require('./routes/keranjangRoutes');
const pesananRoutes = require('./routes/pesananRoutes');
const midtransRoutes = require('./routes/midtransRoutes');
const penjualRoutes = require('./routes/penjualRoutes');

app.use('/api', authRoutes);
app.use('/api/kios', kiosRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/search', searchRoutes);
app.use('/api', keranjangRoutes); 
app.use('/api', pesananRoutes); 
app.use('/api/midtrans', midtransRoutes);
app.use('/api/penjual', penjualRoutes);

// Static files (foto)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Root endpoint
app.get('/', (req, res) => {
  res.send('PasMeal API Backend is running...');
});

// Export untuk Serverless
module.exports = app;
module.exports.handler = serverless(app);

// LOCAL: server listen + WhatsApp background
if (require.main === module) {
  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Start WhatsApp service di background (non-blocking)
    setImmediate(async () => {
      try {
        const { connectToWhatsApp } = require('./services/whatsapp');
        await connectToWhatsApp();
        console.log('WhatsApp service started');
      } catch (err) {
        console.error('Failed to start WhatsApp service:', err);
      }
    });
  });
}
