const config = require('../config/env');

function httpAuthMiddleware(req, res, next) {
    if (req.path === '/login-check') return next();
    const clientPassword = req.headers['x-app-password'];
    if (!clientPassword || clientPassword !== config.APP_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized: Invalid credentials' });
    }
    next();
}

function socketAuthMiddleware(socket, next) {
    const token = socket.handshake.auth?.token;
    if (token === config.APP_PASSWORD) {
        return next();
    }
    next(new Error('Authentication failed: Invalid token'));
}

module.exports = {
    httpAuthMiddleware,
    socketAuthMiddleware
};

