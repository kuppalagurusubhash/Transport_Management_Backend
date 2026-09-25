import { Router } from 'express';
import { handleWebhook, verifyWebhook, simulateIncomingMessage, sendCatalogLink } from '../controllers/whatsapp.controller.js';

const router = Router();

// UltraMsg Webhook endpoints
router.post('/webhook', handleWebhook);
router.get('/webhook', verifyWebhook);

// Simulation / Testing endpoint
router.post('/simulate', simulateIncomingMessage);

// Send Catalog Link directly to user
router.post('/send-catalog', sendCatalogLink);

export default router;

