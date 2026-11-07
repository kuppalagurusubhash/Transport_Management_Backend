import { Router } from 'express';
import {
  getTrips,
  getTripById,
  createTrip,
  updateTrip,
  notifyDriverWhatsApp,
  notifyBuyerWhatsApp,
  sendTripCompletionWhatsApp,
  endTripAndSendPDF,
  getLoadingEntries,
  addLoadingEntry,
  updateLoadingEntry,
  deleteLoadingEntry,
  getUnloadingAllocations,
  addUnloadingAllocation,
  updateUnloadingAllocation,
  recordAllocationDelivery,
  cancelUnloadingAllocation,
  reassignUnloadedOrder,
  getAllocationHistory
} from '../controllers/trip.controller.js';
import { authenticate, requireRole, optionalAuthenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// Multi-quarry loading routes
router.get('/:tripId/loading-entries', optionalAuthenticate, getLoadingEntries);
router.post('/:tripId/loading-entries', authenticate, requireRole(['owner', 'loading_supervisor']), addLoadingEntry);
router.patch('/:tripId/loading-entries/:entryId', authenticate, requireRole(['owner', 'loading_supervisor']), updateLoadingEntry);
router.delete('/:tripId/loading-entries/:entryId', authenticate, requireRole(['owner']), deleteLoadingEntry);

// Multi-party Kerala unloading & allocations
router.get('/:tripId/unloading-allocations', optionalAuthenticate, getUnloadingAllocations);
router.post('/:tripId/unloading-allocations', authenticate, requireRole(['owner', 'loading_supervisor']), addUnloadingAllocation);
router.patch('/:tripId/unloading-allocations/:allocationId', authenticate, requireRole(['owner', 'loading_supervisor', 'driver']), updateUnloadingAllocation);
router.post('/:tripId/unloading-allocations/:allocationId/deliveries', authenticate, requireRole(['owner', 'driver']), recordAllocationDelivery);

// Order cancellation & alternative party reassignment
router.post('/:tripId/unloading-allocations/:allocationId/cancel', authenticate, requireRole(['owner', 'loading_supervisor']), cancelUnloadingAllocation);
router.post('/:tripId/reassign-unloaded-order', authenticate, requireRole(['owner', 'loading_supervisor']), reassignUnloadedOrder);
router.get('/:tripId/allocation-history', optionalAuthenticate, getAllocationHistory);

// Standard trip routes
router.get('/', authenticate, getTrips);
router.get('/:id', authenticate, requireRole(['owner', 'driver', 'loading_supervisor']), getTripById);
router.post('/', authenticate, requireRole(['owner', 'loading_supervisor']), createTrip);
router.put('/:id', authenticate, requireRole(['owner', 'driver', 'loading_supervisor']), updateTrip);
router.post('/:id/notify-whatsapp', authenticate, requireRole(['owner', 'loading_supervisor']), notifyDriverWhatsApp);
router.post('/:id/notify-buyer-whatsapp', authenticate, requireRole(['owner', 'loading_supervisor']), notifyBuyerWhatsApp);
router.post('/:id/send-completion-whatsapp', authenticate, requireRole(['owner', 'loading_supervisor']), sendTripCompletionWhatsApp);
router.post('/:id/end-trip', authenticate, requireRole(['owner', 'loading_supervisor', 'driver']), endTripAndSendPDF);

export default router;
