import { Router } from 'express';
import { getOrders, createOrder, updateOrderStatus } from '../controllers/order.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', authenticate, requireRole(['owner', 'loading_supervisor', 'buyer']), getOrders);
router.post('/', authenticate, requireRole(['owner', 'buyer']), createOrder);
router.put('/:id/status', authenticate, requireRole(['owner', 'loading_supervisor', 'buyer']), updateOrderStatus);

export default router;
