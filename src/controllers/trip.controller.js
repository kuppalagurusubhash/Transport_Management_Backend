import { OrderReassignment } from '../models/OrderReassignment.js';
import { ledgerService } from '../services/ledger.service.js';
import { Trip } from '../models/Trip.js';
import { Order } from '../models/Order.js';
import { User } from '../models/User.js';
import { UnloadingParty } from '../models/UnloadingParty.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { buyerLedgerService } from '../services/buyerLedger.service.js';
import mongoose from 'mongoose';

/**
 * Helper to auto-construct stops from linked orders if stops array not provided.
 */
async function buildStopsFromOrders(orderIds, existingStops = [], origin = 'Quarry') {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return { stops: existingStops || [], stoneLines: [] };
  }

  const orders = await Order.find({ id: { $in: orderIds } });
  if (orders.length === 0) {
    return { stops: existingStops || [], stoneLines: [] };
  }

  // If stops already has full details matching these orders, preserve them
  if (Array.isArray(existingStops) && existingStops.length > 0) {
    return { stops: existingStops, stoneLines: [] };
  }

  const stops = [];
  const allStoneLines = [];
  let stopIdx = 1;

  for (const ord of orders) {
    let buyer = await User.findOne({
      role: 'buyer',
      $or: [
        { 'buyerProfile.id': ord.unloadingPartyId },
        { _id: mongoose.isValidObjectId(ord.unloadingPartyId) ? ord.unloadingPartyId : null },
        { username: ord.unloadingPartyId }
      ].filter(Boolean)
    }) || await UnloadingParty.findOne({ id: ord.unloadingPartyId });

    const buyerDistrict = ord.district || buyer?.buyerProfile?.district || buyer?.district || 'Palakkad';
    const lines = (ord.lines || []).map((l, lIdx) => ({
      id: `sl-${Date.now()}-${stopIdx}-${lIdx}`,
      size: l.size,
      thickness: l.thickness,
      finish: l.finish,
      pieces: l.pieces,
      sqftPerPiece: l.sqftPerPiece || (l.size === '3x3' ? 9 : 4),
      ratePerSqft: l.ratePerSqft,
      loadingPartyId: origin || 'Quarry',
      unloadingPartyId: ord.unloadingPartyId,
      orderId: ord.id,
      destination: buyerDistrict
    }));

    const totalPcs = lines.reduce((sum, l) => sum + (Number(l.pieces) || 0), 0);
    const totalSqft = lines.reduce((sum, l) => sum + ((Number(l.pieces) || 0) * (Number(l.sqftPerPiece) || 4)), 0);
    const expAmt = lines.reduce((sum, l) => sum + ((Number(l.pieces) || 0) * (Number(l.sqftPerPiece) || 4) * (Number(l.ratePerSqft) || 40)), 0);

    stops.push({
      stopNumber: stopIdx++,
      orderId: ord.id,
      unloadingPartyId: ord.unloadingPartyId,
      buyerName: buyer?.name || ord.unloadingPartyId,
      buyerPhone: buyer?.phone || '',
      district: buyerDistrict,
      deliveryLocation: buyer?.buyerProfile?.location || buyer?.location || buyerDistrict,
      stoneSummary: lines.map(l => `${l.size} (${l.pieces} pcs)`).join(', '),
      stoneLines: lines,
      totalPieces: totalPcs,
      totalSqft,
      expectedAmount: expAmt,
      collectedCash: 0,
      collectedOnline: 0,
      status: 'pending'
    });

    allStoneLines.push(...lines);
  }

  return { stops, stoneLines: allStoneLines };
}

/**
 * Synchronize buyer ledgers for all buyers associated with a trip.
 */
function syncAffectedBuyerLedgers(trip) {
  if (!trip) return;
  const buyerIds = new Set([
    trip.unloadingPartyId,
    ...(trip.unloadingPartyIds || []),
    ...(trip.stops || []).map(s => s.unloadingPartyId)
  ].filter(Boolean));

  for (const buyerId of buyerIds) {
    buyerLedgerService.calculateBuyerLedger(buyerId).catch(err => {
      console.warn(`[Trip Controller] Ledger sync error for buyer '${buyerId}':`, err.message);
    });
  }
}

/**
 * Synchronize order status for all linked orders on trip status change.
 */
async function syncLinkedOrdersStatus(trip) {
  if (!trip) return;
  const orderIds = new Set([
    trip.orderId,
    ...(trip.orderIds || []),
    ...(trip.stops || []).map(s => s.orderId)
  ].filter(Boolean));

  if (orderIds.size === 0) return;

  const targetStatus = trip.status === 'delivered' ? 'delivered'
    : trip.status === 'paid' ? 'paid'
    : ['in-transit', 'loading'].includes(trip.status) ? 'dispatched'
    : 'dispatched';

  await Order.updateMany(
    { id: { $in: Array.from(orderIds) } },
    { status: targetStatus }
  ).catch(err => {
    console.warn(`[Trip Controller] Error syncing linked orders to '${targetStatus}':`, err.message);
  });
}

export const getTrips = async (req, res, next) => {
  try {
    let filter = {};
    if (req.user && req.user.role === 'driver') {
      filter.driverId = req.user.driverRef;
    } else if (req.user && req.user.role === 'buyer') {
      filter.$or = [
        { unloadingPartyId: req.user.buyerRef },
        { unloadingPartyIds: req.user.buyerRef },
        { 'stops.unloadingPartyId': req.user.buyerRef }
      ];
    }
    const data = await Trip.find(filter).sort({ date: -1 });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const getTripById = async (req, res, next) => {
  try {
    const data = await Trip.findOne({ id: req.params.id });
    if (!data) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const createTrip = async (req, res, next) => {
  try {
    const tripData = req.body;

    // Normalize order IDs
    const candidateOrderIds = [
      ...(Array.isArray(tripData.orderIds) ? tripData.orderIds : []),
      tripData.orderId
    ].filter(Boolean);
    const uniqueOrderIds = Array.from(new Set(candidateOrderIds));

    if (uniqueOrderIds.length > 0) {
      tripData.orderIds = uniqueOrderIds;
      if (!tripData.orderId) tripData.orderId = uniqueOrderIds[0];

      // Auto-build stops if not explicitly provided or empty
      if (!Array.isArray(tripData.stops) || tripData.stops.length === 0) {
        const { stops, stoneLines } = await buildStopsFromOrders(uniqueOrderIds, tripData.stops, tripData.origin);
        tripData.stops = stops;
        if (!tripData.stoneLines || tripData.stoneLines.length === 0) {
          tripData.stoneLines = stoneLines;
        }
      }

      // Collect unloadingPartyIds
      const unloadingParties = new Set([
        tripData.unloadingPartyId,
        ...(tripData.unloadingPartyIds || []),
        ...(tripData.stops || []).map(s => s.unloadingPartyId)
      ].filter(Boolean));
      tripData.unloadingPartyIds = Array.from(unloadingParties);
      if (!tripData.unloadingPartyId && tripData.unloadingPartyIds.length > 0) {
        tripData.unloadingPartyId = tripData.unloadingPartyIds[0];
      }
    } else if ((!tripData.stoneLines || tripData.stoneLines.length === 0) && tripData.orderId) {
      // Single order fallback
      const order = await Order.findOne({ id: tripData.orderId });
      if (order && Array.isArray(order.lines) && order.lines.length > 0) {
        tripData.stoneLines = order.lines.map((l, idx) => ({
          id: `sl-${Date.now()}-${idx}`,
          size: l.size,
          thickness: l.thickness,
          finish: l.finish,
          pieces: l.pieces,
          sqftPerPiece: l.sqftPerPiece || (l.size === '3x3' ? 9 : 4),
          ratePerSqft: l.ratePerSqft,
          loadingPartyId: tripData.origin || 'Quarry',
          unloadingPartyId: order.unloadingPartyId,
          orderId: order.id,
          destination: order.district
        }));
      }
    }

    const newTrip = new Trip(tripData);
    await newTrip.save();

    // Sync linked orders status and buyer ledgers
    await syncLinkedOrdersStatus(newTrip);
    syncAffectedBuyerLedgers(newTrip);

    // Trigger driver WhatsApp notification if driver is assigned
    let whatsappResult = null;
    if (newTrip.driverId) {
      try {
        whatsappResult = await whatsappService.sendDriverTripNotification(newTrip);
      } catch (waErr) {
        console.error('[Trip Controller] WhatsApp driver notification dispatch failed:', waErr.message);
      }
    }

    // Trigger buyer WhatsApp notification when vehicle & driver are assigned
    let buyerWhatsappResult = null;
    if (newTrip.driverId || newTrip.lorryId) {
      try {
        buyerWhatsappResult = await whatsappService.sendBuyerTripNotification(newTrip);
      } catch (buyerWaErr) {
        console.error('[Trip Controller] WhatsApp buyer notification dispatch failed:', buyerWaErr.message);
      }
    }

    res.status(201).json({
      ...newTrip.toObject(),
      whatsappNotification: whatsappResult,
      buyerWhatsappNotification: buyerWhatsappResult
    });
  } catch (err) {
    next(err);
  }
};

export const updateTrip = async (req, res, next) => {
  try {
    const existingTrip = await Trip.findOne({ id: req.params.id });
    const updateData = req.body;

    // If orderIds added or changed
    if (Array.isArray(updateData.orderIds) && updateData.orderIds.length > 0 && (!updateData.stops || updateData.stops.length === 0)) {
      const { stops, stoneLines } = await buildStopsFromOrders(updateData.orderIds, [], updateData.origin || existingTrip?.origin);
      updateData.stops = stops;
      if (!updateData.stoneLines || updateData.stoneLines.length === 0) {
        updateData.stoneLines = stoneLines;
      }
    }

    const trip = await Trip.findOneAndUpdate(
      { id: req.params.id },
      updateData,
      { new: true }
    );

    if (trip) {
      // Sync linked orders status & recalculate buyer ledgers
      await syncLinkedOrdersStatus(trip);
      syncAffectedBuyerLedgers(trip);

      // If driver or vehicle was newly assigned or changed, or status dispatched
      const driverChanged = trip.driverId && (!existingTrip || existingTrip.driverId !== trip.driverId);
      const lorryChanged = trip.lorryId && (!existingTrip || existingTrip.lorryId !== trip.lorryId);
      const isDispatched = updateData.status === 'in-transit' && existingTrip?.status !== 'in-transit';

      if (driverChanged || (isDispatched && trip.driverId)) {
        whatsappService.sendDriverTripNotification(trip).catch(err => {
          console.error('[Trip Controller] Driver WhatsApp notification error on trip update:', err.message);
        });
      }

      // Notify Kerala buyer when vehicle & driver are assigned or reassigned or trip dispatched
      if ((driverChanged || lorryChanged || isDispatched) && trip.driverId && trip.lorryId) {
        whatsappService.sendBuyerTripNotification(trip).catch(err => {
          console.error('[Trip Controller] Buyer WhatsApp notification error on trip update:', err.message);
        });
      }

      // Automatically send whole trip PDF to Driver & Owner when trip ends
      const isTripEnded = 
        (trip.status === 'completed' || trip.status === 'closed' || trip.status === 'returned_to_base') &&
        (!existingTrip || existingTrip.status !== trip.status || updateData.status === 'completed' || updateData.status === 'closed');

      if (isTripEnded) {
        console.log(`[Trip Controller] Trip ${trip.code || trip.id} ended (status: ${trip.status}). Dispatching final PDF to driver & owner...`);
        whatsappService.sendTripEndedReportToDriverAndOwner(trip).catch(err => {
          console.error('[Trip Controller] Error sending trip ended PDF to driver & owner:', err.message);
        });
      }
    }

    res.status(200).json(trip);
  } catch (err) {
    next(err);
  }
};

export const notifyDriverWhatsApp = async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ id: req.params.id });
    if (!trip) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    const result = await whatsappService.sendDriverTripNotification(trip);
    res.status(200).json({
      success: result.success,
      data: result
    });
  } catch (err) {
    next(err);
  }
};

export const notifyBuyerWhatsApp = async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ id: req.params.id });
    if (!trip) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    const result = await whatsappService.sendBuyerTripNotification(trip);
    res.status(200).json({
      success: result.success,
      data: result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Dispatch whole Trip Master Manifest & Settlement PDF document to Driver and Owner via WhatsApp
 */
export const sendTripCompletionWhatsApp = async (req, res, next) => {
  try {
    const { id } = req.params;
    const trip = await Trip.findOne({ id });
    if (!trip) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    const result = await whatsappService.sendTripEndedReportToDriverAndOwner(trip);
    res.status(200).json({
      success: result.success,
      message: 'Trip completion PDF dispatched to driver and owner',
      data: result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Marks trip completed and sends final PDF report to driver & owner
 */
export const endTripAndSendPDF = async (req, res, next) => {
  try {
    const { id } = req.params;
    const now = new Date();
    const trip = await Trip.findOneAndUpdate(
      { id },
      {
        status: 'completed',
        completedDate: now.toISOString().slice(0, 10),
        completedTime: now.toTimeString().slice(0, 5),
        completedBy: req.user?.username || 'Owner'
      },
      { new: true }
    );

    if (!trip) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    const whatsappResult = await whatsappService.sendTripEndedReportToDriverAndOwner(trip);
    res.status(200).json({
      success: true,
      message: 'Trip finalized as completed and final PDF sent to Driver & Owner',
      trip,
      whatsappResult
    });
  } catch (err) {
    next(err);
  }
};




// ─── MULTI-QUARRY LOADING MANAGEMENT ────────────────────────────────────────

export const getLoadingEntries = async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ id: req.params.tripId });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

    let entries = trip.loadingEntries || [];
    if (entries.length === 0 && Array.isArray(trip.stoneLines) && trip.stoneLines.length > 0) {
      entries = trip.stoneLines.map((line, idx) => ({
        id: line.id || ('sl-entry-' + idx),
        loadingDate: trip.date || '',
        loadingTime: '',
        quarryName: line.loadingPartyId || 'Quarry',
        quarryLocation: 'Ramapuram',
        loadingPartyId: line.loadingPartyId,
        supplierName: line.loadingPartyId,
        stoneType: 'Kadapa Black Stone',
        size: line.size || '2x2',
        thickness: line.thickness || '40mm',
        finish: line.finish || 'rough',
        pieces: Number(line.pieces) || 0,
        sqftPerPiece: Number(line.sqftPerPiece) || (line.size === '3x3' ? 9 : 4),
        totalSqft: (Number(line.pieces) || 0) * (Number(line.sqftPerPiece) || 4),
        ratePerSqft: Number(line.ratePerSqft) || 18,
        ratePerPiece: (Number(line.sqftPerPiece) || 4) * (Number(line.ratePerSqft) || 18),
        totalLoadingValue: (Number(line.pieces) || 0) * (Number(line.sqftPerPiece) || 4) * (Number(line.ratePerSqft) || 18),
        hamaliAmount: 0,
        hamaliRatePerPiece: 0,
        hamaliCalculationMode: 'lump',
        hamaliPaidBy: 'owner',
        hamaliPaymentMode: 'cash',
        hamaliStatus: 'pending',
        mamulluAmount: 0,
        mamulluPaidBy: 'owner',
        otherExpenses: 0,
        notes: '',
        billNumber: '',
        supportingDocuments: [],
        auditTrail: []
      }));
    }
    const totalPieces = entries.reduce((s, e) => s + (Number(e.pieces) || 0), 0);
    const totalSqft = entries.reduce((s, e) => s + (Number(e.totalSqft) || 0), 0);
    const totalLoadingValue = entries.reduce((s, e) => s + (Number(e.totalLoadingValue) || 0), 0);
    const totalHamali = entries.reduce((s, e) => s + (Number(e.hamaliAmount) || 0), 0);
    const totalOtherExpenses = entries.reduce((s, e) => s + (Number(e.otherExpenses) || 0) + (Number(e.mamulluAmount) || 0), 0);

    // Quarry-wise breakdown
    const quarryMap = new Map();
    for (const e of entries) {
      const qKey = e.loadingPartyId || e.quarryName || 'Default Quarry';
      const existing = quarryMap.get(qKey) || {
        quarryName: e.quarryName || 'Quarry',
        quarryLocation: e.quarryLocation || 'Ramapuram',
        loadingPartyId: e.loadingPartyId,
        pieces: 0,
        sqft: 0,
        value: 0,
        hamali: 0,
        otherExpenses: 0,
        entriesCount: 0
      };
      existing.pieces += (Number(e.pieces) || 0);
      existing.sqft += (Number(e.totalSqft) || 0);
      existing.value += (Number(e.totalLoadingValue) || 0);
      existing.hamali += (Number(e.hamaliAmount) || 0);
      existing.otherExpenses += (Number(e.otherExpenses) || 0) + (Number(e.mamulluAmount) || 0);
      existing.entriesCount += 1;
      quarryMap.set(qKey, existing);
    }

    res.status(200).json({
      success: true,
      tripId: trip.id,
      tripCode: trip.code,
      summary: {
        totalPieces,
        totalSqft,
        totalLoadingValue,
        totalHamali,
        totalOtherExpenses,
        totalLoadingCost: totalLoadingValue + totalHamali + totalOtherExpenses,
        quarriesCount: quarryMap.size
      },
      quarryWiseSummary: Array.from(quarryMap.values()),
      loadingEntries: entries
    });
  } catch (err) {
    next(err);
  }
};

export const addLoadingEntry = async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ id: req.params.tripId });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

    const entryData = req.body;
    const pieces = Number(entryData.pieces);
    if (!pieces || pieces <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive pieces count is required' });
    }

    const sqftPerPiece = Number(entryData.sqftPerPiece) || (entryData.size === '3x3' ? 9 : 4);
    const totalSqft = pieces * sqftPerPiece;
    const ratePerSqft = Number(entryData.ratePerSqft) || 18;
    const ratePerPiece = Number(entryData.ratePerPiece) || (ratePerSqft * sqftPerPiece);
    const totalLoadingValue = Number(entryData.totalLoadingValue) || (totalSqft * ratePerSqft);

    const entryId = 'le-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);

    const newEntry = {
      id: entryId,
      loadingDate: entryData.loadingDate || trip.date || new Date().toISOString().slice(0, 10),
      loadingTime: entryData.loadingTime || '',
      quarryName: entryData.quarryName || 'Quarry',
      quarryLocation: entryData.quarryLocation || 'Ramapuram',
      loadingPartyId: entryData.loadingPartyId || 'Quarry',
      supplierName: entryData.supplierName || entryData.quarryName || '',
      stoneType: entryData.stoneType || 'Kadapa Black Stone',
      size: entryData.size || '2x2',
      thickness: entryData.thickness || '40mm',
      finish: entryData.finish || 'rough',
      pieces,
      sqftPerPiece,
      totalSqft,
      ratePerSqft,
      ratePerPiece,
      totalLoadingValue,
      hamaliAmount: Number(entryData.hamaliAmount) || 0,
      hamaliRatePerPiece: Number(entryData.hamaliRatePerPiece) || 0,
      hamaliCalculationMode: entryData.hamaliCalculationMode || 'lump',
      hamaliPaidBy: entryData.hamaliPaidBy || 'owner',
      hamaliPaymentMode: entryData.hamaliPaymentMode || 'cash',
      hamaliStatus: entryData.hamaliStatus || 'pending',
      mamulluAmount: Number(entryData.mamulluAmount) || 0,
      mamulluPaidBy: entryData.mamulluPaidBy || 'owner',
      otherExpenses: Number(entryData.otherExpenses) || 0,
      notes: entryData.notes || '',
      billNumber: entryData.billNumber || '',
      supportingDocuments: Array.isArray(entryData.supportingDocuments) ? entryData.supportingDocuments : [],
      auditTrail: [{
        editedAt: new Date().toISOString(),
        editedBy: req.user?.username || 'Owner',
        reason: 'Initial loading entry recorded'
      }]
    };

    trip.loadingEntries = trip.loadingEntries || [];
    trip.loadingEntries.push(newEntry);

    // Synchronize to stoneLines for legacy screens
    trip.stoneLines = trip.stoneLines || [];
    trip.stoneLines.push({
      id: 'sl-' + entryId,
      loadingPartyId: newEntry.loadingPartyId,
      size: newEntry.size,
      thickness: newEntry.thickness,
      finish: newEntry.finish,
      sqftPerPiece: newEntry.sqftPerPiece,
      pieces: newEntry.pieces,
      ratePerSqft: newEntry.ratePerSqft,
      destination: ''
    });

    await trip.save();

    res.status(201).json({
      success: true,
      message: 'Loading operation recorded successfully',
      data: newEntry,
      loadingEntries: trip.loadingEntries
    });
  } catch (err) {
    next(err);
  }
};

export const updateLoadingEntry = async (req, res, next) => {
  try {
    const { tripId, entryId } = req.params;
    const trip = await Trip.findOne({ id: tripId });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

    const entryIndex = (trip.loadingEntries || []).findIndex(e => e.id === entryId);
    if (entryIndex === -1) {
      return res.status(404).json({ success: false, message: 'Loading entry not found' });
    }

    const currentEntry = trip.loadingEntries[entryIndex];
    const updates = req.body;

    const previousValues = {
      pieces: currentEntry.pieces,
      ratePerSqft: currentEntry.ratePerSqft,
      totalLoadingValue: currentEntry.totalLoadingValue,
      quarryName: currentEntry.quarryName,
      hamaliAmount: currentEntry.hamaliAmount
    };

    if (updates.pieces !== undefined) currentEntry.pieces = Number(updates.pieces);
    if (updates.ratePerSqft !== undefined) currentEntry.ratePerSqft = Number(updates.ratePerSqft);
    if (updates.ratePerPiece !== undefined) currentEntry.ratePerPiece = Number(updates.ratePerPiece);
    if (updates.quarryName !== undefined) currentEntry.quarryName = updates.quarryName;
    if (updates.quarryLocation !== undefined) currentEntry.quarryLocation = updates.quarryLocation;
    if (updates.stoneType !== undefined) currentEntry.stoneType = updates.stoneType;
    if (updates.size !== undefined) currentEntry.size = updates.size;
    if (updates.thickness !== undefined) currentEntry.thickness = updates.thickness;
    if (updates.finish !== undefined) currentEntry.finish = updates.finish;
    if (updates.hamaliAmount !== undefined) currentEntry.hamaliAmount = Number(updates.hamaliAmount);
    if (updates.otherExpenses !== undefined) currentEntry.otherExpenses = Number(updates.otherExpenses);
    if (updates.notes !== undefined) currentEntry.notes = updates.notes;
    if (updates.billNumber !== undefined) currentEntry.billNumber = updates.billNumber;

    // Recalculate derived totals
    const sqftPerPiece = Number(currentEntry.sqftPerPiece) || (currentEntry.size === '3x3' ? 9 : 4);
    currentEntry.totalSqft = currentEntry.pieces * sqftPerPiece;
    currentEntry.totalLoadingValue = updates.totalLoadingValue !== undefined
      ? Number(updates.totalLoadingValue)
      : (currentEntry.totalSqft * (Number(currentEntry.ratePerSqft) || 18));

    currentEntry.auditTrail = currentEntry.auditTrail || [];
    currentEntry.auditTrail.push({
      editedAt: new Date().toISOString(),
      editedBy: req.user?.username || 'Owner',
      reason: updates.editReason || 'Loading entry correction',
      previousValues
    });

    trip.loadingEntries[entryIndex] = currentEntry;
    await trip.save();

    res.status(200).json({
      success: true,
      message: 'Loading entry updated with audit trail',
      data: currentEntry
    });
  } catch (err) {
    next(err);
  }
};

export const deleteLoadingEntry = async (req, res, next) => {
  try {
    const { tripId, entryId } = req.params;
    const trip = await Trip.findOne({ id: tripId });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

    if (['delivered', 'paid', 'completed', 'closed'].includes(trip.status)) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete loading entries from a finalized/completed trip.'
      });
    }

    trip.loadingEntries = (trip.loadingEntries || []).filter(e => e.id !== entryId);
    trip.stoneLines = (trip.stoneLines || []).filter(l => l.id !== ('sl-' + entryId));

    await trip.save();

    res.status(200).json({
      success: true,
      message: 'Loading entry deleted successfully',
      loadingEntries: trip.loadingEntries
    });
  } catch (err) {
    next(err);
  }
};

// ─── MULTIPLE UNLOADING PARTIES IN KERALA ───────────────────────────────────

export const getUnloadingAllocations = async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ id: req.params.tripId });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

    const allocations = trip.unloadingEntries || [];
    const totalAssignedPieces = allocations.reduce((s, a) => s + (Number(a.piecesAssigned || a.piecesDelivered) || 0), 0);
    const totalDeliveredPieces = allocations.filter(a => a.status === 'delivered').reduce((s, a) => s + (Number(a.piecesDelivered) || 0), 0);
    const totalBilled = allocations.reduce((s, a) => s + (Number(a.totalDeliveryAmount) || 0), 0);
    const totalReceived = allocations.reduce((s, a) => s + (Number(a.amountReceived) || 0), 0);
    const totalOutstanding = Math.max(0, totalBilled - totalReceived);

    res.status(200).json({
      success: true,
      tripId: trip.id,
      tripCode: trip.code,
      summary: {
        totalAllocations: allocations.length,
        totalAssignedPieces,
        totalDeliveredPieces,
        totalBilled,
        totalReceived,
        totalOutstanding
      },
      allocations
    });
  } catch (err) {
    next(err);
  }
};

export const addUnloadingAllocation = async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ id: req.params.tripId });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

    const allocData = req.body;
    const piecesToAssign = Number(allocData.piecesAssigned || allocData.piecesDelivered);
    if (!piecesToAssign || piecesToAssign <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive piece allocation required' });
    }

    // Inventory check: cannot exceed total loaded pieces
    const totalLoadedPieces = (trip.loadingEntries || []).reduce((s, e) => s + (Number(e.pieces) || 0), 0) ||
      (trip.stoneLines || []).reduce((s, l) => s + (Number(l.pieces) || 0), 0);

    const alreadyAssignedPieces = (trip.unloadingEntries || [])
      .filter(e => e.status !== 'cancelled')
      .reduce((s, e) => s + (Number(e.piecesAssigned || e.piecesDelivered) || 0), 0);

    if (totalLoadedPieces > 0 && (alreadyAssignedPieces + piecesToAssign) > totalLoadedPieces) {
      return res.status(400).json({
        success: false,
        message: `Allocation exceeds total loaded pieces! Loaded: ${totalLoadedPieces}, already allocated: ${alreadyAssignedPieces}, requested: ${piecesToAssign}.`
      });
    }

    const sqftPerPiece = allocData.size === '3x3' ? 9 : 4;
    const sqft = piecesToAssign * sqftPerPiece;
    const agreedRate = Number(allocData.agreedRate) || 40;
    const totalDeliveryAmount = Number(allocData.totalDeliveryAmount) || (sqft * agreedRate);

    const allocId = 'un-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);

    const newAllocation = {
      id: allocId,
      unloadingPartyId: allocData.unloadingPartyId,
      partyName: allocData.partyName || allocData.unloadingPartyId,
      contactPhone: allocData.contactPhone || '',
      deliveryLocation: allocData.deliveryLocation || 'Kerala',
      orderId: allocData.orderId || null,
      deliveryDate: allocData.deliveryDate || trip.date || '',
      deliveryTime: allocData.deliveryTime || '',
      stoneType: allocData.stoneType || 'Kadapa Black Stone',
      size: allocData.size || '2x2',
      thickness: allocData.thickness || '40mm',
      finish: allocData.finish || 'rough',
      piecesLoaded: totalLoadedPieces,
      piecesAssigned: piecesToAssign,
      piecesDelivered: Number(allocData.piecesDelivered) || 0,
      piecesRejected: Number(allocData.piecesRejected) || 0,
      piecesDamaged: Number(allocData.piecesDamaged) || 0,
      piecesReturned: 0,
      sqftDelivered: sqft,
      agreedRate,
      totalDeliveryAmount,
      amountReceived: Number(allocData.amountReceived) || 0,
      amountReceivable: Math.max(0, totalDeliveryAmount - (Number(allocData.amountReceived) || 0)),
      unloadingLabourCharges: Number(allocData.unloadingLabourCharges) || 0,
      proofOfDelivery: allocData.proofOfDelivery || '',
      deliveryNotes: allocData.deliveryNotes || '',
      invoiceNumber: allocData.invoiceNumber || ('INV-' + Date.now().toString().slice(-6)),
      status: allocData.status || (Number(allocData.piecesDelivered) >= piecesToAssign ? 'delivered' : 'pending'),
      auditTrail: [{
        editedAt: new Date().toISOString(),
        editedBy: req.user?.username || 'Owner',
        reason: 'Party delivery destination allocated'
      }]
    };

    trip.unloadingEntries = trip.unloadingEntries || [];
    trip.unloadingEntries.push(newAllocation);

    // Sync party IDs list
    trip.unloadingPartyIds = Array.from(new Set([
      trip.unloadingPartyId,
      ...(trip.unloadingPartyIds || []),
      allocData.unloadingPartyId
    ].filter(Boolean)));

    await trip.save();

    res.status(201).json({
      success: true,
      message: 'Unloading party allocation added successfully',
      data: newAllocation
    });
  } catch (err) {
    next(err);
  }
};

export const updateUnloadingAllocation = async (req, res, next) => {
  try {
    const { tripId, allocationId } = req.params;
    const trip = await Trip.findOne({ id: tripId });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

    const allocIndex = (trip.unloadingEntries || []).findIndex(e => e.id === allocationId);
    if (allocIndex === -1) {
      return res.status(404).json({ success: false, message: 'Unloading allocation not found' });
    }

    const current = trip.unloadingEntries[allocIndex];
    const updates = req.body;

    const previousValues = {
      piecesAssigned: current.piecesAssigned,
      piecesDelivered: current.piecesDelivered,
      agreedRate: current.agreedRate,
      status: current.status,
      amountReceived: current.amountReceived
    };

    if (updates.piecesAssigned !== undefined) current.piecesAssigned = Number(updates.piecesAssigned);
    if (updates.agreedRate !== undefined) current.agreedRate = Number(updates.agreedRate);
    if (updates.deliveryLocation !== undefined) current.deliveryLocation = updates.deliveryLocation;
    if (updates.contactPhone !== undefined) current.contactPhone = updates.contactPhone;
    if (updates.invoiceNumber !== undefined) current.invoiceNumber = updates.invoiceNumber;
    if (updates.deliveryNotes !== undefined) current.deliveryNotes = updates.deliveryNotes;
    if (updates.unloadingLabourCharges !== undefined) current.unloadingLabourCharges = Number(updates.unloadingLabourCharges);

    const sqftPerPiece = current.size === '3x3' ? 9 : 4;
    const pieces = Number(current.piecesAssigned) || Number(current.piecesDelivered) || 0;
    current.sqftDelivered = pieces * sqftPerPiece;
    current.totalDeliveryAmount = updates.totalDeliveryAmount !== undefined
      ? Number(updates.totalDeliveryAmount)
      : (current.sqftDelivered * (Number(current.agreedRate) || 40));

    current.amountReceivable = Math.max(0, current.totalDeliveryAmount - (Number(current.amountReceived) || 0));

    current.auditTrail = current.auditTrail || [];
    current.auditTrail.push({
      editedAt: new Date().toISOString(),
      editedBy: req.user?.username || 'Owner',
      reason: updates.editReason || 'Allocation details updated',
      previousValues
    });

    trip.unloadingEntries[allocIndex] = current;
    await trip.save();

    res.status(200).json({
      success: true,
      message: 'Unloading allocation updated',
      data: current
    });
  } catch (err) {
    next(err);
  }
};

export const recordAllocationDelivery = async (req, res, next) => {
  try {
    const { tripId, allocationId } = req.params;
    const trip = await Trip.findOne({ id: tripId });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

    const allocIndex = (trip.unloadingEntries || []).findIndex(e => e.id === allocationId);
    if (allocIndex === -1) {
      return res.status(404).json({ success: false, message: 'Allocation not found' });
    }

    const alloc = trip.unloadingEntries[allocIndex];
    const {
      piecesDelivered,
      piecesDamaged,
      piecesRejected,
      amountReceived,
      damageReason,
      proofOfDelivery,
      deliveryNotes
    } = req.body;

    const assigned = Number(alloc.piecesAssigned || alloc.piecesDelivered) || 0;
    const delivered = Number(piecesDelivered);

    if (delivered < 0 || delivered > assigned) {
      return res.status(400).json({
        success: false,
        message: `Delivered pieces cannot exceed assigned quantity of ${assigned}.`
      });
    }

    alloc.piecesDelivered = delivered;
    if (piecesDamaged !== undefined) alloc.piecesDamaged = Number(piecesDamaged);
    if (piecesRejected !== undefined) alloc.piecesRejected = Number(piecesRejected);
    if (damageReason !== undefined) alloc.damageReason = damageReason;
    if (amountReceived !== undefined) alloc.amountReceived = Number(amountReceived);
    if (proofOfDelivery !== undefined) alloc.proofOfDelivery = proofOfDelivery;
    if (deliveryNotes !== undefined) alloc.deliveryNotes = deliveryNotes;

    alloc.status = delivered >= assigned ? 'delivered' : (delivered > 0 ? 'partially_delivered' : 'pending');
    alloc.amountReceivable = Math.max(0, (Number(alloc.totalDeliveryAmount) || 0) - (Number(alloc.amountReceived) || 0));

    alloc.auditTrail = alloc.auditTrail || [];
    alloc.auditTrail.push({
      editedAt: new Date().toISOString(),
      editedBy: req.user?.username || 'Driver',
      reason: `Delivery confirmed: ${delivered}/${assigned} pieces. Status: ${alloc.status}.`
    });

    trip.unloadingEntries[allocIndex] = alloc;
    await trip.save();

    // Sync ledger
    if (alloc.unloadingPartyId) {
      ledgerService.getCustomerLedger(alloc.unloadingPartyId).catch(e => console.warn(e.message));
    }

    res.status(200).json({
      success: true,
      message: 'Delivery recorded successfully',
      data: alloc
    });
  } catch (err) {
    next(err);
  }
};

// ─── CANCELLED ORDERS & ALTERNATIVE REASSIGNMENT ─────────────────────────────

export const cancelUnloadingAllocation = async (req, res, next) => {
  try {
    const { tripId, allocationId } = req.params;
    const trip = await Trip.findOne({ id: tripId });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

    const allocIndex = (trip.unloadingEntries || []).findIndex(e => e.id === allocationId);
    if (allocIndex === -1) {
      return res.status(404).json({ success: false, message: 'Allocation not found' });
    }

    const alloc = trip.unloadingEntries[allocIndex];
    const { cancellationReason } = req.body;

    if (!cancellationReason || !cancellationReason.trim()) {
      return res.status(400).json({ success: false, message: 'Cancellation reason is required' });
    }

    const now = new Date().toISOString();
    const delivered = Number(alloc.piecesDelivered) || 0;
    const assigned = Number(alloc.piecesAssigned || alloc.piecesDelivered) || 0;

    alloc.cancellationReason = cancellationReason;
    alloc.cancelledAt = now;
    alloc.cancelledBy = req.user?.username || 'Owner';
    alloc.status = delivered > 0 ? 'partially_delivered' : 'cancelled';

    alloc.auditTrail = alloc.auditTrail || [];
    alloc.auditTrail.push({
      editedAt: now,
      editedBy: req.user?.username || 'Owner',
      reason: `Order cancelled. Reason: ${cancellationReason}. Delivered: ${delivered}, Undelivered: ${assigned - delivered}.`
    });

    trip.unloadingEntries[allocIndex] = alloc;
    await trip.save();

    // If linked order exists, update order status to reassignment_required
    if (alloc.orderId) {
      await Order.findOneAndUpdate(
        { id: alloc.orderId },
        {
          status: 'reassignment_required',
          cancellationReason,
          cancelledAt: now,
          cancelledBy: req.user?.username || 'Owner'
        }
      );
    }

    res.status(200).json({
      success: true,
      message: 'Order allocation cancelled. Full audit record preserved.',
      availablePiecesForReassignment: Math.max(0, assigned - delivered),
      data: alloc
    });
  } catch (err) {
    next(err);
  }
};

export const reassignUnloadedOrder = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const {
      originalAllocationId,
      cancellationReason,
      alternativePartyId,
      alternativePartyName,
      newDeliveryLocation,
      newAgreedRate,
      reassignedQuantityPieces,
      extraTransportCost,
      extraHamaliCost,
      notes
    } = req.body;

    const trip = await Trip.findOne({ id: tripId });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

    const origIndex = (trip.unloadingEntries || []).findIndex(e => e.id === originalAllocationId);
    if (origIndex === -1) {
      return res.status(404).json({ success: false, message: 'Original allocation not found' });
    }

    const origAlloc = trip.unloadingEntries[origIndex];
    const deliveredSoFar = Number(origAlloc.piecesDelivered) || 0;
    const totalAssigned = Number(origAlloc.piecesAssigned || origAlloc.piecesDelivered) || 0;
    const remainingPieces = Math.max(0, totalAssigned - deliveredSoFar);

    const piecesToReassign = Number(reassignedQuantityPieces) || remainingPieces;

    if (piecesToReassign <= 0 || piecesToReassign > remainingPieces) {
      return res.status(400).json({
        success: false,
        message: `Invalid reassignment pieces! Available: ${remainingPieces}, requested: ${piecesToReassign}.`
      });
    }

    if (!alternativePartyId || !newDeliveryLocation || !newAgreedRate) {
      return res.status(400).json({
        success: false,
        message: 'alternativePartyId, newDeliveryLocation, and newAgreedRate are required'
      });
    }

    const now = new Date().toISOString();
    const reassignmentId = 'reassign-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);

    // 1. Never delete original allocation: preserve it with cancellation details
    origAlloc.cancellationReason = cancellationReason || origAlloc.cancellationReason || 'Destination reassigned';
    origAlloc.cancelledAt = origAlloc.cancelledAt || now;
    origAlloc.cancelledBy = req.user?.username || 'Owner';
    origAlloc.status = deliveredSoFar > 0 ? 'partially_delivered' : 'cancelled';
    origAlloc.reassignmentId = reassignmentId;

    origAlloc.auditTrail = origAlloc.auditTrail || [];
    origAlloc.auditTrail.push({
      editedAt: now,
      editedBy: req.user?.username || 'Owner',
      reason: `Stones reassigned to ${alternativePartyName || alternativePartyId} at ${newDeliveryLocation}.`
    });

    trip.unloadingEntries[origIndex] = origAlloc;

    // 2. Create OrderReassignment audit record
    const priceDiff = (Number(newAgreedRate) - (Number(origAlloc.agreedRate) || 0)) * (piecesToReassign * (origAlloc.size === '3x3' ? 9 : 4));

    const reassignmentDoc = new OrderReassignment({
      id: reassignmentId,
      originalOrderId: origAlloc.orderId || ('ord-' + origAlloc.id),
      originalCustomerId: origAlloc.unloadingPartyId,
      originalCustomerName: origAlloc.partyName || origAlloc.unloadingPartyId,
      alternativeCustomerId: alternativePartyId,
      alternativeCustomerName: alternativePartyName || alternativePartyId,
      tripId: trip.id,
      lorryPlate: trip.lorryId,
      cancellationReason: cancellationReason || 'Customer cancellation in Kerala',
      cancellationDate: now.slice(0, 10),
      reassignmentDate: now.slice(0, 10),
      reassignedBy: req.user?.username || 'Owner',
      originalRate: Number(origAlloc.agreedRate) || 0,
      newAgreedRate: Number(newAgreedRate),
      originalQuantityPieces: totalAssigned,
      reassignedQuantityPieces: piecesToReassign,
      stoneType: origAlloc.stoneType,
      size: origAlloc.size,
      thickness: origAlloc.thickness,
      finish: origAlloc.finish,
      newDeliveryLocation,
      priceDifference: priceDiff,
      extraTransportCost: Number(extraTransportCost) || 0,
      extraHamaliCost: Number(extraHamaliCost) || 0,
      otherExpenses: 0,
      status: 'reassigned',
      notes: notes || ''
    });

    await reassignmentDoc.save();

    // 3. Add new unloading entry for alternative customer
    const sqftPerPiece = origAlloc.size === '3x3' ? 9 : 4;
    const newSqft = piecesToReassign * sqftPerPiece;
    const totalAmount = newSqft * Number(newAgreedRate);

    const newAllocId = 'un-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);

    const newAllocation = {
      id: newAllocId,
      unloadingPartyId: alternativePartyId,
      partyName: alternativePartyName || alternativePartyId,
      contactPhone: '',
      deliveryLocation: newDeliveryLocation,
      orderId: origAlloc.orderId || null,
      deliveryDate: trip.date || now.slice(0, 10),
      deliveryTime: '',
      stoneType: origAlloc.stoneType,
      size: origAlloc.size,
      thickness: origAlloc.thickness,
      finish: origAlloc.finish,
      piecesLoaded: origAlloc.piecesLoaded || totalAssigned,
      piecesAssigned: piecesToReassign,
      piecesDelivered: 0,
      piecesRejected: 0,
      piecesDamaged: 0,
      piecesReturned: 0,
      sqftDelivered: newSqft,
      agreedRate: Number(newAgreedRate),
      totalDeliveryAmount: totalAmount,
      amountReceived: 0,
      amountReceivable: totalAmount,
      unloadingLabourCharges: Number(extraHamaliCost) || 0,
      proofOfDelivery: '',
      deliveryNotes: `Reassigned from ${origAlloc.partyName || origAlloc.unloadingPartyId}. Extra transport: ₹${extraTransportCost || 0}.`,
      invoiceNumber: 'INV-RE-' + Date.now().toString().slice(-6),
      reassignedFromOrderId: origAlloc.orderId || origAlloc.id,
      reassignmentId,
      status: 'pending',
      auditTrail: [{
        editedAt: now,
        editedBy: req.user?.username || 'Owner',
        reason: `Reassignment created from original allocation ${origAlloc.id}.`
      }]
    };

    trip.unloadingEntries.push(newAllocation);

    // If extra transport expense incurred, add to trip expenses
    if (Number(extraTransportCost) > 0) {
      trip.expenses = trip.expenses || [];
      trip.expenses.push({
        id: 'exp-' + Date.now(),
        label: `Reassignment Divert Transport: ${origAlloc.partyName} -> ${alternativePartyName}`,
        amount: Number(extraTransportCost),
        category: 'other',
        paidBy: 'owner',
        paymentMode: 'cash',
        review: 'approved',
        notes: `Order reassignment to ${newDeliveryLocation}`
      });
    }

    trip.unloadingPartyIds = Array.from(new Set([
      ...(trip.unloadingPartyIds || []),
      alternativePartyId
    ]));

    await trip.save();

    res.status(201).json({
      success: true,
      message: 'Order successfully reassigned to alternative Kerala party',
      reassignment: reassignmentDoc,
      newAllocation,
      originalAllocation: origAlloc
    });
  } catch (err) {
    next(err);
  }
};

export const getAllocationHistory = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const [trip, reassignments] = await Promise.all([
      Trip.findOne({ id: tripId }),
      OrderReassignment.find({ tripId }).sort({ createdAt: -1 })
    ]);

    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

    res.status(200).json({
      success: true,
      tripId: trip.id,
      tripCode: trip.code,
      allocations: trip.unloadingEntries || [],
      reassignments
    });
  } catch (err) {
    next(err);
  }
};
