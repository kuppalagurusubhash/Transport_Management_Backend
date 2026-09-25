import { Router } from 'express';
import {
  getTripManifestPDF,
  downloadTripManifestPDF,
  getBuyerEwayBillPDF,
  downloadBuyerEwayBillPDF,
  sendTripManifestToDriverWhatsApp,
  sendBuyerEwayBillToWhatsApp
} from '../controllers/pdf.controller.js';

const router = Router();

// Stream or view Trip Manifest PDF in browser
router.get('/trip/:id', getTripManifestPDF);
router.get('/trip/:id/download', downloadTripManifestPDF);

// Stream or view Buyer E-Way Bill / Delivery Challan PDF in browser
router.get('/eway/:tripId', getBuyerEwayBillPDF);
router.get('/eway/:tripId/download', downloadBuyerEwayBillPDF);

// Dispatch PDF documents directly to WhatsApp
router.post('/trip/:id/send-whatsapp', sendTripManifestToDriverWhatsApp);
router.post('/eway/:tripId/send-whatsapp', sendBuyerEwayBillToWhatsApp);

export default router;
