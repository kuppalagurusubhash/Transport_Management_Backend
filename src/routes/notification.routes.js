import { Router } from 'express';
import { getNotifications, readAllNotifications } from '../controllers/notification.controller.js';

const router = Router();

router.get('/', getNotifications);
router.put('/read-all', readAllNotifications);

export default router;
