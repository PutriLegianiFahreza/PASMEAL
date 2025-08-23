// utils/formatter.js

// Ambil BASE_URL dari env atau req, hapus trailing slash
const getBaseUrl = (req) => {
  let BASE_URL = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
  return BASE_URL.replace(/\/$/, "");
};

// Format menu dengan foto_menu yang sudah diproses jadi URL lengkap
const formatMenu = (menu, req) => {
  const BASE_URL = getBaseUrl(req);
  return {
    ...menu,
    foto_menu: menu.foto_menu ? `${BASE_URL}/uploads/${menu.foto_menu}` : null,
  };
};

// Format item keranjang (pakai BASE_URL yang sama + hitung subtotal)
const formatKeranjang = (item, req) => {
  const BASE_URL = getBaseUrl(req);
  return {
    ...item,
    foto_menu: item.foto_menu ? `${BASE_URL}/uploads/${item.foto_menu}` : null,
    subtotal: Number(item.harga) * Number(item.jumlah),
  };
};

// Format detail pesanan (reuse formatMenu)
const formatPesananItem = (item, req) => formatMenu(item, req);

// Format kios dengan gambar_kios
const formatKios = (kios, req) => {
  const BASE_URL = getBaseUrl(req);
  return {
    ...kios,
    gambar_kios: kios.gambar_kios ? `${BASE_URL}/uploads/${kios.gambar_kios}` : null,
  };
};

module.exports = {
  formatMenu,
  formatKeranjang,
  formatPesananItem,
  formatKios,
};
