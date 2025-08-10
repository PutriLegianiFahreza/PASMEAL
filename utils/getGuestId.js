// utils/getGuestId.js
const getGuestId = (req) => {
  // prioritas: body > query > header 'x-buyer-id'
  return req.body?.guest_id || req.query?.guest_id || req.headers['x-buyer-id'] || null;
};

module.exports = getGuestId;
