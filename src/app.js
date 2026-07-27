import express from 'express';
import cors from 'cors';
import { requestLogger } from './middlewares/logger.js';
import apiRouter from './routes/index.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(requestLogger);

// ---------------- API Routes ----------------
app.use('/api/v1', apiRouter);
app.use('/api', apiRouter);

export default app;
