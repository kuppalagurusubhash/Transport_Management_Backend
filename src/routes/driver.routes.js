import { Router } from 'express';
import { getDrivers, getDriverById, createDriver, updateDriver, deleteDriver } from '../controllers/driver.controller.js';
import { authenticate, requireRole, optionalAuthenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', optionalAuthenticate, getDrivers);
router.get('/:id', optionalAuthenticate, getDriverById);
router.post('/', authenticate, requireRole(['owner', 'loading_supervisor']), createDriver);
router.put('/:id', authenticate, requireRole(['owner', 'loading_supervisor']), updateDriver);
router.delete('/:id', authenticate, requireRole(['owner', 'loading_supervisor']), deleteDriver);

export default router;
