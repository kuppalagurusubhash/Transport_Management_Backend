import { ledgerService } from '../services/ledger.service.js';
import { partyPdfService } from '../services/partyPdf.service.js';

export const getPartyLedger = async (req, res, next) => {
  try {
    const { partyId } = req.params;
    const { startDate, endDate, tripId, lorryId, role, search } = req.query;

    const ledger = await ledgerService.getLedger(partyId, {
      startDate,
      endDate,
      tripId,
      lorryId,
      role,
      search
    });

    res.status(200).json({
      success: true,
      data: ledger
    });
  } catch (err) {
    next(err);
  }
};

export const getPartyStatement = async (req, res, next) => {
  try {
    const { partyId } = req.params;
    const { startDate, endDate, role } = req.query;

    const statement = await ledgerService.getLedger(partyId, {
      startDate,
      endDate,
      role
    });

    res.status(200).json({
      success: true,
      data: statement
    });
  } catch (err) {
    next(err);
  }
};

export const getPartyOutstanding = async (req, res, next) => {
  try {
    const { partyId } = req.params;
    const { role } = req.query;

    const data = await ledgerService.getLedger(partyId, { role });

    res.status(200).json({
      success: true,
      party: data.party,
      outstandingBalance: data.summary.closingBalance,
      summary: data.summary
    });
  } catch (err) {
    next(err);
  }
};

export const downloadPartyStatementPDF = async (req, res, next) => {
  try {
    const { partyId } = req.params;
    const { startDate, endDate, role, search } = req.query;

    const statementPdf = await partyPdfService.generateStatementPDF(partyId, {
      startDate,
      endDate,
      role,
      search
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${statementPdf.filename}"`);
    res.send(statementPdf.buffer);
  } catch (err) {
    next(err);
  }
};

export const viewPartyStatementPDF = async (req, res, next) => {
  try {
    const { partyId } = req.params;
    const { startDate, endDate, role, search } = req.query;

    const statementPdf = await partyPdfService.generateStatementPDF(partyId, {
      startDate,
      endDate,
      role,
      search
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${statementPdf.filename}"`);
    res.send(statementPdf.buffer);
  } catch (err) {
    next(err);
  }
};
