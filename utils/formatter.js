// Format menu dengan foto_menu yang sudah diproses jadi URL lengkap
const formatMenu = (menu, req) => {
  let BASE_URL = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
  BASE_URL = BASE_URL.replace(/\/$/, ""); // hapus trailing slash

  return {
    ...menu,
    foto_menu: menu.foto_menu ? `${BASE_URL}/uploads/${menu.foto_menu}` : null,
  };
};

// Format item keranjang
const formatKeranjang = (item, req) => {
  return {
    ...item,
    foto_menu: item.foto_menu
      ? `${process.env.BASE_URL || `${req.protocol}://${req.get("host")}`}/uploads/${item.foto_menu}`
      : null,
    subtotal: item.harga * item.jumlah,
  };
};

// Format detail pesanan (bisa reuse formatMenu)
const formatPesananItem = (item, req) => {
  return formatMenu(item, req);
};

// Format kios dengan gambar_kios
const formatKios = (kios, req) => {
  let BASE_URL = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
  BASE_URL = BASE_URL.replace(/\/$/, "");

  return {
    ...kios,
    gambar_kios: kios.gambar_kios 
      ? `${BASE_URL}/uploads/${kios.gambar_kios}` 
      : null,
  };
};

module.exports = {
  formatMenu,
  formatKeranjang,
  formatPesananItem,
  formatKios,
};
