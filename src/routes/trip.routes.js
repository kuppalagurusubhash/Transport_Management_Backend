import { Router } from 'express';
import { getTrips, getTripById, createTrip, updateTrip, notifyDriverWhatsApp, notifyBuyerWhatsApp } from '../controllers/trip.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', authenticate, getTrips);
router.get('/:id', authenticate, requireRole(['owner', 'driver', 'loading_supervisor']), getTripById);
router.post('/', authenticate, requireRole(['owner', 'loading_supervisor']), createTrip);
router.put('/:id', authenticate, requireRole(['owner', 'driver', 'loading_supervisor']), updateTrip);
router.post('/:id/notify-whatsapp', authenticate, requireRole(['owner', 'loading_supervisor']), notifyDriverWhatsApp);
router.post('/:id/notify-buyer-whatsapp', authenticate, requireRole(['owner', 'loading_supervisor']), notifyBuyerWhatsApp);

export default router;


