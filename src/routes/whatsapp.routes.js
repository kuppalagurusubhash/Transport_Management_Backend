import { Router } from 'express';
import { handleWebhook, verifyWebhook, simulateIncomingMessage, sendCatalogLink } from '../controllers/whatsapp.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

// UltraMsg Webhook endpoints
router.post('/webhook', handleWebhook);
router.get('/webhook', verifyWebhook);

// Simulation / Testing endpoint (development only)
router.post('/simulate', (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Simulation endpoint is disabled in production.' });
  }
  return simulateIncomingMessage(req, res, next);
});

// Send Catalog Link directly to user (protected)
router.post('/send-catalog', authenticate, requireRole(['owner', 'loading_supervisor']), sendCatalogLink);

export default router;

