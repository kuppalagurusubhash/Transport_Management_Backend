import { Router } from 'express';
import { getStoneRates, updateStoneRate, createStoneRate } from '../controllers/stoneRate.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', getStoneRates);
router.post('/', authenticate, requireRole(['owner']), createStoneRate);
router.put('/:id', authenticate, requireRole(['owner']), updateStoneRate);

export default router;
