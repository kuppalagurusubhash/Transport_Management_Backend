import { Router } from 'express';
import { getNotifications, readAllNotifications } from '../controllers/notification.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', authenticate, getNotifications);
router.put('/read-all', authenticate, readAllNotifications);

export default router;
