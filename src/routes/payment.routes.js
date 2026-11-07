import { Router } from 'express';
import { getPayments, getPaymentById, createPayment, updatePayment } from '../controllers/payment.controller.js';
import { authenticate, requireRole, optionalAuthenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', optionalAuthenticate, getPayments);
router.get('/:paymentId', optionalAuthenticate, getPaymentById);
router.post('/', authenticate, requireRole(['owner', 'loading_supervisor']), createPayment);
router.patch('/:paymentId', authenticate, requireRole(['owner']), updatePayment);

export default router;
