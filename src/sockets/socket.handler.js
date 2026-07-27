import { setSocketIo } from './socket.instance.js';

export const initSocketHandlers = (io) => {
  // Store the io instance globally
  setSocketIo(io);

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Client can join a role-specific room (e.g. owner, driver, loading_supervisor)
    socket.on('join:room', (room) => {
      socket.join(room);
      console.log(`[Socket] Client ${socket.id} joined room: ${room}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  console.log('[Socket] WebSocket handlers initialized');
};
