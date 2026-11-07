import { Router } from 'express';
import {
  getLoadingParties,
  createLoadingParty,
  deleteLoadingParty,
  getLoadingPartyById,
  updateLoadingParty
} from '../controllers/loadingParty.controller.js';
import {
  getPartyLedger,
  getPartyStatement,
  getPartyOutstanding,
  downloadPartyStatementPDF,
  viewPartyStatementPDF
} from '../controllers/ledger.controller.js';
import { authenticate, requireRole, optionalAuthenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// Ledger & Financial Statement routes for Supplier / Quarry
router.get('/:partyId/ledger', optionalAuthenticate, (req, res, next) => { req.query.role = 'supplier'; getPartyLedger(req, res, next); });
router.get('/:partyId/statement', optionalAuthenticate, (req, res, next) => { req.query.role = 'supplier'; getPartyStatement(req, res, next); });
router.get('/:partyId/outstanding', optionalAuthenticate, (req, res, next) => { req.query.role = 'supplier'; getPartyOutstanding(req, res, next); });
router.get('/:partyId/statement.pdf', optionalAuthenticate, (req, res, next) => { req.query.role = 'supplier'; downloadPartyStatementPDF(req, res, next); });
router.get('/:partyId/statement-view.pdf', optionalAuthenticate, (req, res, next) => { req.query.role = 'supplier'; viewPartyStatementPDF(req, res, next); });

// CRUD routes
router.get('/', optionalAuthenticate, getLoadingParties);
router.get('/:id', optionalAuthenticate, getLoadingPartyById);
router.post('/', authenticate, requireRole(['owner', 'loading_supervisor']), createLoadingParty);
router.put('/:id', authenticate, requireRole(['owner', 'loading_supervisor']), updateLoadingParty);
router.delete('/:id', authenticate, requireRole(['owner', 'loading_supervisor']), deleteLoadingParty);

export default router;
