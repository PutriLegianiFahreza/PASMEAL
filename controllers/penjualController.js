const pool = require('../config/db');

const updateProfil = async (req, res) => {
    const { nama, no_hp, email } = req.body;
    const penjualId = req.user?.id; // pastikan ada middleware auth

    if (!penjualId) {
        return res.status(401).json({ message: 'Tidak ada ID penjual' });
    }

    try {
        await pool.query(
            'UPDATE penjual SET nama = $1, no_hp = $2, email = $3 WHERE id = $4',
            [nama, no_hp, email, penjualId]
        );

        res.json({ message: 'Profil berhasil diperbarui' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Gagal memperbarui profil' });
    }
};

module.exports = { updateProfil };
