// utils/formatter.js

// Format menu dengan foto_menu dari Cloudinary
const formatMenu = (menu) => ({
  ...menu,
  foto_menu: menu.foto_menu || null,
});

// Format item keranjang (foto_menu + subtotal)
const formatKeranjang = (item) => ({
  ...item,
  foto_menu: item.foto_menu || null,
  subtotal: Number(item.harga) * Number(item.jumlah),
});

// Format detail pesanan (reuse formatMenu)
const formatPesananItem = (item) => formatMenu(item);

// Format kios dengan gambar_kios dari Cloudinary
const formatKios = (kios) => ({
  ...kios,
  gambar_kios: kios.gambar_kios || null,
});

module.exports = {
  formatMenu,
  formatKeranjang,
  formatPesananItem,
  formatKios,
};
