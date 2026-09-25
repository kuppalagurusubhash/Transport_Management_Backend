import express from 'express';
import cors from 'cors';
import { requestLogger } from './middlewares/logger.js';
import apiRouter from './routes/index.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Serve generated PDF documents statically
app.use('/documents', express.static(path.join(__dirname, '../public/documents')));

// ---------------- API Routes ----------------
app.use('/api/v1', apiRouter);
app.use('/api', apiRouter);

export default app;
