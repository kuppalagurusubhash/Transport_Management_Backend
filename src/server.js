import 'dotenv/config';
import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { connectDB } from './config/db.js';
import { initSocketHandlers } from './sockets/socket.handler.js';
import { printStartupBanner } from './middlewares/logger.js';
import { whatsappPollerService } from './services/whatsappPoller.service.js';
import { validateEnv } from './utils/env-validator.util.js';

// Validate environment on boot
validateEnv();

const PORT = process.env.PORT || 5000;

// Create HTTP server from Express app
const httpServer = http.createServer(app);

// Allowed origins
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

// Attach socket.io to HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
    methods: ['GET', 'POST']
  }
});

// Initialize socket event handlers
initSocketHandlers(io);

// Connect to MongoDB then start server
connectDB();

// Start real-time WhatsApp message polling (for local development without public tunnels)
whatsappPollerService.start();

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\x1b[31m✖ Port ${PORT} is already in use. Kill the process and restart.\x1b[0m`);
    console.error(`\x1b[33m  Run: netstat -ano | findstr :${PORT}  →  taskkill /PID <pid> /F\x1b[0m`);
    process.exit(1);
  } else {
    throw err;
  }
});

httpServer.listen(PORT, () => {
  printStartupBanner(PORT);
});
