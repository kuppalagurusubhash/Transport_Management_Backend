import { Router } from 'express';
import { getOwnerDashboard, getLoadingDashboard, getBuyerDashboard } from '../controllers/dashboard.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

// GET /api/v1/dashboard/owner
router.get('/owner', authenticate, requireRole(['owner']), getOwnerDashboard);

// GET /api/v1/dashboard/loading
router.get('/loading', authenticate, requireRole(['owner', 'loading_supervisor']), getLoadingDashboard);

// GET /api/v1/dashboard/buyer
router.get('/buyer', authenticate, requireRole(['owner', 'buyer']), getBuyerDashboard);

export default router;
