import { Router } from 'express';
import { getLorries, getLorryById, createLorry, updateLorry, deleteLorry } from '../controllers/lorry.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', authenticate, requireRole(['owner', 'driver', 'loading_supervisor']), getLorries);
router.get('/:id', authenticate, requireRole(['owner', 'driver', 'loading_supervisor']), getLorryById);
router.post('/', authenticate, requireRole(['owner']), createLorry);
router.put('/:id', authenticate, requireRole(['owner', 'driver', 'loading_supervisor']), updateLorry);
router.delete('/:id', authenticate, requireRole(['owner']), deleteLorry);

export default router;
