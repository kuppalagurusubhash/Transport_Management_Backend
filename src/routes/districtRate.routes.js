import { Router } from 'express';
import { getDistrictRates, updateDistrictRate, createDistrictRate } from '../controllers/districtRate.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', getDistrictRates);
router.post('/', authenticate, requireRole(['owner']), createDistrictRate);
router.put('/:id', authenticate, requireRole(['owner']), updateDistrictRate);

export default router;
