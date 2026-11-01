const { Server } = require('socket.io');
const { socketAuthMiddleware } = require('./middlewares/auth');
const whatsappService = require('./services/whatsappService');

function setupSocketIO(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin: '*'
        }
    });

    io.use(socketAuthMiddleware);

    whatsappService.setSocketIO(io);

    io.on('connection', (socket) => {
        // Send current status immediately upon connecting
        socket.emit('wa_status', whatsappService.getStatus());
    });

    return io;
}

module.exports = { setupSocketIO };

