import { Router } from 'express';
import { getLoadingParties, createLoadingParty, deleteLoadingParty, getLoadingPartyById, updateLoadingParty } from '../controllers/loadingParty.controller.js';
import { authenticate, requireRole, optionalAuthenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', optionalAuthenticate, getLoadingParties);
router.get('/:id', optionalAuthenticate, getLoadingPartyById);
router.post('/', authenticate, requireRole(['owner', 'loading_supervisor']), createLoadingParty);
router.put('/:id', authenticate, requireRole(['owner', 'loading_supervisor']), updateLoadingParty);
router.delete('/:id', authenticate, requireRole(['owner', 'loading_supervisor']), deleteLoadingParty);

export default router;
