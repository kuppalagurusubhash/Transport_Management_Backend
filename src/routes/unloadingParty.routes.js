import { Router } from 'express';
import { getUnloadingParties, createUnloadingParty } from '../controllers/unloadingParty.controller.js';
import {
  getPartyLedger,
  getPartyStatement,
  getPartyOutstanding,
  downloadPartyStatementPDF,
  viewPartyStatementPDF
} from '../controllers/ledger.controller.js';
import { authenticate, requireRole, optionalAuthenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// Ledger & Financial Statement routes for Customer / Buyer
router.get('/:partyId/ledger', optionalAuthenticate, (req, res, next) => { req.query.role = 'customer'; getPartyLedger(req, res, next); });
router.get('/:partyId/statement', optionalAuthenticate, (req, res, next) => { req.query.role = 'customer'; getPartyStatement(req, res, next); });
router.get('/:partyId/outstanding', optionalAuthenticate, (req, res, next) => { req.query.role = 'customer'; getPartyOutstanding(req, res, next); });
router.get('/:partyId/statement.pdf', optionalAuthenticate, (req, res, next) => { req.query.role = 'customer'; downloadPartyStatementPDF(req, res, next); });
router.get('/:partyId/statement-view.pdf', optionalAuthenticate, (req, res, next) => { req.query.role = 'customer'; viewPartyStatementPDF(req, res, next); });

// CRUD routes
router.get('/', optionalAuthenticate, getUnloadingParties);
router.post('/', authenticate, requireRole(['owner', 'loading_supervisor']), createUnloadingParty);

export default router;
