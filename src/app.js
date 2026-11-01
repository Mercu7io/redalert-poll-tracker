const express = require('express');
const path = require('path');
const apiRoutes = require('./routes/apiRoutes');

function createApp() {
    const app = express();

    app.use(express.json());
    app.use(express.static(path.join(__dirname, '..', 'public')));

    app.use('/api', apiRoutes);

    // Global error handler
    app.use((err, req, res, next) => {
        console.error('[SERVER ERROR]', err);
        res.status(500).json({ error: 'Internal Server Error', message: err.message });
    });

    return app;
}

module.exports = { createApp };

