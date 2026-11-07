import { Router } from 'express';
import {
  getTripManifestPDF,
  downloadTripManifestPDF,
  getBuyerEwayBillPDF,
  downloadBuyerEwayBillPDF,
  sendTripManifestToDriverWhatsApp,
  sendBuyerEwayBillToWhatsApp,
  sendTripCompletionPDFToDriverAndOwner
} from '../controllers/pdf.controller.js';
import { authenticate, requireRole, optionalAuthenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// Stream or view Trip Manifest PDF in browser
router.get('/trip/:id', optionalAuthenticate, getTripManifestPDF);
router.get('/trip/:id/download', optionalAuthenticate, downloadTripManifestPDF);

// Stream or view Buyer E-Way Bill / Delivery Challan PDF in browser
router.get('/eway/:tripId', optionalAuthenticate, getBuyerEwayBillPDF);
router.get('/eway/:tripId/download', optionalAuthenticate, downloadBuyerEwayBillPDF);

// Dispatch PDF documents directly to WhatsApp (protected)
router.post('/trip/:id/send-whatsapp', authenticate, requireRole(['owner', 'loading_supervisor', 'driver']), sendTripManifestToDriverWhatsApp);
router.post('/trip/:id/send-completion-whatsapp', authenticate, requireRole(['owner', 'loading_supervisor', 'driver']), sendTripCompletionPDFToDriverAndOwner);
router.post('/eway/:tripId/send-whatsapp', authenticate, requireRole(['owner', 'loading_supervisor']), sendBuyerEwayBillToWhatsApp);

export default router;
