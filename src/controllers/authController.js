const config = require('../config/env');

class AuthController {
    loginCheck(req, res) {
        const { password } = req.body;
        if (password === config.APP_PASSWORD) {
            return res.json({ success: true });
        }
        return res.status(401).json({ success: false, error: 'Invalid password' });
    }
}

module.exports = new AuthController();
module.exports.AuthController = AuthController;

