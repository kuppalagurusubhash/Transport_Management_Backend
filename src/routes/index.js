import { Router } from 'express';
import driverRoutes from './driver.routes.js';
import lorryRoutes from './lorry.routes.js';
import loadingPartyRoutes from './loadingParty.routes.js';
import unloadingPartyRoutes from './unloadingParty.routes.js';
import orderRoutes from './order.routes.js';
import tripRoutes from './trip.routes.js';
import notificationRoutes from './notification.routes.js';
import authRoutes from './auth.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import stoneRateRoutes from './stoneRate.routes.js';
import districtRateRoutes from './districtRate.routes.js';

const router = Router();

// Auth routes
router.use('/auth', authRoutes);

// Owner dashboard
router.use('/dashboard', dashboardRoutes);

// Domain-specific routes
router.use('/drivers', driverRoutes);
router.use('/lorries', lorryRoutes);
router.use('/loading-parties', loadingPartyRoutes);
router.use('/unloading-parties', unloadingPartyRoutes);
router.use('/orders', orderRoutes);
router.use('/trips', tripRoutes);
router.use('/notifications', notificationRoutes);
router.use('/stone-rates', stoneRateRoutes);
router.use('/district-rates', districtRateRoutes);

export default router;
