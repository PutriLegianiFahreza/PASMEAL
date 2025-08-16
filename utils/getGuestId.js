const getGuestId = (req) => {
  return req.body?.guest_id || req.query?.guest_id || req.headers['x-buyer-id'] || null;
};

module.exports = getGuestId;
