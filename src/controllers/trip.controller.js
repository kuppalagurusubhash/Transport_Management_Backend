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

      // If driver or vehicle was newly assigned or changed, dispatch notifications
      const driverChanged = trip.driverId && (!existingTrip || existingTrip.driverId !== trip.driverId);
      const lorryChanged = trip.lorryId && (!existingTrip || existingTrip.lorryId !== trip.lorryId);

      if (driverChanged) {
        whatsappService.sendDriverTripNotification(trip).catch(err => {
          console.error('[Trip Controller] Driver WhatsApp notification error on trip update:', err.message);
        });
      }

      // Notify buyer when vehicle & driver are assigned or reassigned
      if ((driverChanged || lorryChanged) && trip.driverId && trip.lorryId) {
        whatsappService.sendBuyerTripNotification(trip).catch(err => {
          console.error('[Trip Controller] Buyer WhatsApp notification error on trip update:', err.message);
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


