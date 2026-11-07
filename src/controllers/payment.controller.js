import { Payment } from '../models/Payment.js';
import { Trip } from '../models/Trip.js';
import { Order } from '../models/Order.js';
import { LoadingParty } from '../models/LoadingParty.js';
import { UnloadingParty } from '../models/UnloadingParty.js';
import { ledgerService } from '../services/ledger.service.js';

export const getPayments = async (req, res, next) => {
  try {
    const { partyId, partyType, startDate, endDate, tripId } = req.query;
    const filter = {};

    if (partyId) filter.partyId = partyId;
    if (partyType) filter.partyType = partyType;
    if (tripId) filter['allocations.tripId'] = tripId;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    const payments = await Payment.find(filter).sort({ date: -1, createdAt: -1 });
    res.status(200).json({
      success: true,
      count: payments.length,
      data: payments
    });
  } catch (err) {
    next(err);
  }
};

export const getPaymentById = async (req, res, next) => {
  try {
    const payment = await Payment.findOne({
      $or: [{ id: req.params.paymentId }, { _id: req.params.paymentId }]
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    res.status(200).json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
};

export const createPayment = async (req, res, next) => {
  try {
    const {
      partyId,
      partyType,
      partyName,
      direction,
      amount,
      date,
      method,
      reference,
      notes,
      paidBy,
      allocations
    } = req.body;

    if (!partyId || !partyType || amount === undefined || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'partyId, partyType (supplier|customer), and positive amount are required.'
      });
    }

    // Duplicate check on non-empty reference
    if (reference && reference.trim()) {
      const existing = await Payment.findOne({
        partyId,
        reference: reference.trim(),
        amount: Number(amount),
        status: { $ne: 'reversed' }
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `Payment with reference '${reference}' and amount ${amount} already recorded on ${existing.date}.`
        });
      }
    }

    const paymentId = 'pay-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    const parsedAmount = Math.round(Number(amount) * 100) / 100;
    const paymentDate = date || new Date().toISOString().slice(0, 10);
    const resolvedDirection = direction || (partyType === 'supplier' ? 'payable_out' : 'receivable_in');

    const payment = new Payment({
      id: paymentId,
      partyId,
      partyType,
      partyName: partyName || '',
      direction: resolvedDirection,
      amount: parsedAmount,
      date: paymentDate,
      method: method || 'phonepe',
      reference: reference || '',
      notes: notes || '',
      paidBy: paidBy || (req.user?.name || 'Owner'),
      createdBy: req.user?.username || 'Owner',
      allocations: Array.isArray(allocations) ? allocations : [],
      status: 'completed'
    });

    await payment.save();

    // If allocated to a trip, sync trip loadingPartyPayments or partyToOwnerPhonePe
    if (Array.isArray(allocations)) {
      for (const alloc of allocations) {
        if (alloc.tripId) {
          const trip = await Trip.findOne({ id: alloc.tripId });
          if (trip) {
            if (partyType === 'supplier') {
              trip.loadingPartyPayments = trip.loadingPartyPayments || [];
              trip.loadingPartyPayments.push({
                id: 'lpp-' + paymentId,
                loadingPartyId: partyId,
                amountPaid: Number(alloc.allocatedAmount) || parsedAmount,
                paidBy: 'owner',
                status: 'paid',
                paymentMode: method || 'phonepe'
              });
              await trip.save();
            } else if (partyType === 'customer') {
              trip.partyToOwnerPhonePe = (trip.partyToOwnerPhonePe || 0) + (Number(alloc.allocatedAmount) || parsedAmount);
              trip.amountPaid = (trip.amountPaid || 0) + (Number(alloc.allocatedAmount) || parsedAmount);
              await trip.save();
            }
          }
        }
      }
    }

    // Sync party outstanding balances
    try {
      const ledger = await ledgerService.getLedger(partyId, { role: partyType });
      if (partyType === 'supplier') {
        await LoadingParty.findOneAndUpdate(
          { id: partyId },
          { paid: ledger.summary.totalPaid, pending: ledger.summary.closingBalance }
        );
      } else {
        await UnloadingParty.findOneAndUpdate(
          { id: partyId },
          { paid: ledger.summary.totalReceived, pending: ledger.summary.closingBalance }
        );
      }
    } catch (e) {
      console.warn('[createPayment] Ledger balance sync warning:', e.message);
    }

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: payment
    });
  } catch (err) {
    next(err);
  }
};

export const updatePayment = async (req, res, next) => {
  try {
    const { status, notes, reference } = req.body;
    const payment = await Payment.findOne({
      $or: [{ id: req.params.paymentId }, { _id: req.params.paymentId }]
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (status !== undefined) payment.status = status;
    if (notes !== undefined) payment.notes = notes;
    if (reference !== undefined) payment.reference = reference;

    await payment.save();

    res.status(200).json({
      success: true,
      message: 'Payment updated successfully',
      data: payment
    });
  } catch (err) {
    next(err);
  }
};
