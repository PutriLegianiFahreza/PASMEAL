const cloudinary = require('cloudinary').v2;

// konfigurasi Cloudinary dari environment variables
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET
});

module.exports = cloudinary;
