import express from 'express';
import cors from 'cors';
import { requestLogger } from './middlewares/logger.js';
import apiRouter from './routes/index.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

if (process.env.NODE_ENV === 'production') {
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server) or from allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    credentials: true
  }));
} else {
  app.use(cors());
}

app.use(express.json());
app.use(requestLogger);

// Healthcheck route for Docker / monitoring
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() }));

// Serve generated PDF documents statically
app.use('/documents', express.static(path.join(__dirname, '../public/documents')));

// ---------------- API Routes ----------------
app.use('/api/v1', apiRouter);
app.use('/api', apiRouter);

export default app;
