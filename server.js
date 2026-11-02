const http = require('http');
const config = require('./src/config/env');
const { initDatabase, closeDatabase } = require('./src/database/db');
const { createApp } = require('./src/app');
const { setupSocketIO } = require('./src/socket');
const whatsappService = require('./src/services/whatsappService');
const tzevaAdomService = require('./src/services/tzevaAdomService');
const contactCache = require('./src/services/contactCache');

async function startServer() {
    try {
        console.log(`=== WHATSAPP POLL TRACKER (MODULAR BAILEYS EDITION) ===`);
        console.log(`Environment: ${config.NODE_ENV}`);
        
        await initDatabase();
        console.log(`Database initialized: ${config.dbPath}`);

        await contactCache.preloadFromDatabase();

        const app = createApp();
        const server = http.createServer(app);

        const io = setupSocketIO(server);
        tzevaAdomService.setSocketIO(io);
        tzevaAdomService.start();

        await whatsappService.boot();

        server.listen(config.PORT, () => {
            console.log(`Web Interface: http://localhost:${config.PORT}`);
            console.log(`=======================================================`);
        });

        const shutdown = async () => {
            console.log('\nShutting down gracefully...');
            tzevaAdomService.stop();
            await whatsappService.disconnect();
            await closeDatabase();
            server.close(() => {
                console.log('Server stopped.');
                process.exit(0);
            });
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

    } catch (err) {
        console.error('Fatal error starting server:', err);
        process.exit(1);
    }
}

if (require.main === module) {
    startServer();
}

module.exports = { startServer };
