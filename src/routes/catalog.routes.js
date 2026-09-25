import { Router } from 'express';
import { getCatalog, getCatalogItemByCode, createCatalogItem } from '../controllers/catalog.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', getCatalog);
router.get('/:code', getCatalogItemByCode);
router.post('/', authenticate, requireRole(['owner']), createCatalogItem);

export default router;
