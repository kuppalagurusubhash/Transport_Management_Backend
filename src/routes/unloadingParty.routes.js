import { Router } from 'express';
import { getUnloadingParties, createUnloadingParty } from '../controllers/unloadingParty.controller.js';
import { authenticate, requireRole, optionalAuthenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', optionalAuthenticate, getUnloadingParties);
router.post('/', authenticate, requireRole(['owner', 'loading_supervisor']), createUnloadingParty);

export default router;
