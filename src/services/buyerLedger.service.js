import { User } from '../models/User.js';
import { UnloadingParty } from '../models/UnloadingParty.js';
import { Trip } from '../models/Trip.js';
import { Order } from '../models/Order.js';
import { DistrictRate } from '../models/DistrictRate.js';
import mongoose from 'mongoose';

/**
 * Unified helper to calculate accurate financials from in-memory arrays.
 */
export const calculateBuyerFinancialsFromData = ({
  buyerId,
  buyerDistrict = 'Palakkad',
  baseTotalOrdered = 0,
  basePaid = 0,
  allTrips = [],
  allOrders = [],
  districtRates = []
}) => {
  const getRate = (line, dist = buyerDistrict) => {
    const match = districtRates.find(r =>
      r.district?.toLowerCase() === dist?.toLowerCase() &&
      r.size === line.size &&
      r.thickness === line.thickness &&
      r.finish === line.finish
    );
    if (match) return match.ratePerSqft;
    return line.ratePerSqft || (line.size === '3x3' ? 40 : 38);
  };

  let tripRevenue = 0;
  let tripPaid = 0;
  let tripDamage = 0;
  const linkedOrderIds = new Set();

  for (const t of allTrips) {
    if (t.orderId) linkedOrderIds.add(t.orderId);
    if (Array.isArray(t.orderIds)) {
      t.orderIds.forEach(id => linkedOrderIds.add(id));
    }

    const buyerStops = Array.isArray(t.stops)
      ? t.stops.filter(s => s.unloadingPartyId === buyerId)
      : [];

    if (buyerStops.length > 0) {
      for (const stop of buyerStops) {
        if (stop.orderId) linkedOrderIds.add(stop.orderId);

        let stopRev = 0;
        if (stop.expectedAmount > 0) {
          stopRev = Number(stop.expectedAmount);
        } else if (Array.isArray(stop.stoneLines) && stop.stoneLines.length > 0) {
          stopRev = stop.stoneLines.reduce((sum, l) => {
            const sqft = (Number(l.sqftPerPiece) || (l.size === '3x3' ? 9 : 4)) * (Number(l.pieces) || 0);
            const rate = Number(l.ratePerSqft) || getRate(l, stop.district || buyerDistrict);
            return sum + (sqft * rate);
          }, 0);
        }

        tripRevenue += stopRev;
        const stopPaid = (Number(stop.collectedCash) || 0) + (Number(stop.collectedOnline) || 0);
        tripPaid += stopPaid;
      }
      // If trip has damage deduction recorded
      if (t.damageDeduction && t.unloadingPartyId === buyerId) {
        tripDamage += (Number(t.damageDeduction) || 0);
      }
    } else if (t.unloadingPartyId === buyerId) {
      const rev = (t.stoneLines || []).reduce((sum, l) => {
        const sqft = (Number(l.sqftPerPiece) || (l.size === '3x3' ? 9 : 4)) * (Number(l.pieces) || 0);
        return sum + (sqft * getRate(l, buyerDistrict));
      }, 0);

      const paidOnTrip = Math.max(
        Number(t.amountPaid) || 0,
        (Number(t.partyToDriverCash) || 0) + (Number(t.partyToOwnerPhonePe) || 0)
      );

      tripRevenue += rev;
      tripPaid += paidOnTrip;
      tripDamage += (Number(t.damageDeduction) || 0);
    }
  }

  const buyerOrders = allOrders.filter(o => o.unloadingPartyId === buyerId);
  let unlinkedOrderRevenue = 0;
  let unlinkedOrderPaid = 0;

  for (const ord of buyerOrders) {
    if (!linkedOrderIds.has(ord.id)) {
      const ordRev = (ord.lines || []).reduce((sum, l) => {
        const sqft = (Number(l.sqftPerPiece) || (l.size === '3x3' ? 9 : 4)) * (Number(l.pieces) || 0);
        const rate = Number(l.ratePerSqft) || getRate(l, ord.district || buyerDistrict);
        return sum + (sqft * rate);
      }, 0);

      unlinkedOrderRevenue += ordRev;
      unlinkedOrderPaid += (Number(ord.amountPaid) || 0);
    }
  }

  const totalOrdered = Math.max(Math.round(tripRevenue + unlinkedOrderRevenue), baseTotalOrdered);
  const paid = Math.max(Math.round(tripPaid + unlinkedOrderPaid), basePaid);
  const damage = Math.round(tripDamage);
  const pending = Math.max(0, totalOrdered - paid - damage);

  return {
    totalOrdered,
    paid,
    pending,
    totalDamage: damage,
    ordersCount: buyerOrders.length,
    activeOrdersCount: buyerOrders.filter(o => ['placed', 'confirmed', 'dispatched'].includes(o.status)).length
  };
};

/**
 * Unified Financial Ledger Service for Buyers / Unloading Parties.
 * Accurately tracks multi-drop trip revenues, order commitments, cash/UPI collections,
 * damage deductions, and remaining balances.
 */
export const buyerLedgerService = {
  /**
   * Resolves a buyer entity by ID or phone number.
   */
  async resolveBuyer(buyerIdOrPhone) {
    if (!buyerIdOrPhone) return null;

    // 1. Try UnloadingParty
    let party = await UnloadingParty.findOne({
      $or: [
        { id: buyerIdOrPhone },
        { phone: buyerIdOrPhone },
        { phone: new RegExp((buyerIdOrPhone.slice(-10)) + '$') }
      ]
    });
    if (party) {
      return {
        id: party.id,
        name: party.name,
        phone: party.phone,
        district: party.district || 'Palakkad',
        totalOrdered: party.totalOrdered || 0,
        paid: party.paid || 0,
        pending: party.pending || 0,
        userId: party.userId
      };
    }

    // 2. Try User with buyer role
    const user = await User.findOne({
      role: 'buyer',
      $or: [
        { 'buyerProfile.id': buyerIdOrPhone },
        { phone: buyerIdOrPhone },
        { phone: new RegExp((buyerIdOrPhone.slice(-10)) + '$') },
        { username: buyerIdOrPhone }
      ]
    });
    if (user && user.buyerProfile) {
      return {
        id: user.buyerProfile.id,
        name: user.name,
        phone: user.phone,
        district: user.buyerProfile.district || 'Palakkad',
        totalOrdered: user.buyerProfile.totalOrdered || 0,
        paid: user.buyerProfile.paid || 0,
        pending: user.buyerProfile.pending || 0,
        userId: user._id
      };
    }

    return null;
  },

  /**
   * Calculates comprehensive and accurate financial ledger for a buyer.
   */
  async calculateBuyerLedger(buyerIdOrPhone) {
    const buyer = await this.resolveBuyer(buyerIdOrPhone);
    if (!buyer || !buyer.id) {
      return {
        matched: false,
        totalOrdersCount: 0,
        activeOrdersCount: 0,
        totalOrdered: 0,
        totalPaid: 0,
        totalDamage: 0,
        remainingDue: 0,
        recentOrders: [],
        activeTrips: []
      };
    }

    const buyerId = buyer.id;
    const buyerDistrict = buyer.district || 'Palakkad';

    // 1. Fetch Orders, Trips, and District Rates in parallel
    const [orders, allTrips, districtRates] = await Promise.all([
      Order.find({ unloadingPartyId: buyerId }).sort({ createdAt: -1 }),
      Trip.find({
        $or: [
          { unloadingPartyId: buyerId },
          { unloadingPartyIds: buyerId },
          { 'stops.unloadingPartyId': buyerId },
          { 'stoneLines.unloadingPartyId': buyerId }
        ]
      }).sort({ date: -1 }),
      DistrictRate.find({})
    ]);

    // Rate lookup helper
    const getRate = (line, dist = buyerDistrict) => {
      const match = districtRates.find(r =>
        r.district.toLowerCase() === dist.toLowerCase() &&
        r.size === line.size &&
        r.thickness === line.thickness &&
        r.finish === line.finish
      );
      if (match) return match.ratePerSqft;
      return line.ratePerSqft || (line.size === '3x3' ? 40 : 38);
    };

    let tripRevenue = 0;
    let tripPaid = 0;
    let tripDamage = 0;
    const linkedOrderIds = new Set();

    // 2. Compute financial breakdown from all trips (supporting multi-drop stops!)
    for (const t of allTrips) {
      if (t.orderId) linkedOrderIds.add(t.orderId);
      if (Array.isArray(t.orderIds)) {
        t.orderIds.forEach(id => linkedOrderIds.add(id));
      }

      // Multi-drop stops check
      const buyerStops = Array.isArray(t.stops)
        ? t.stops.filter(s => s.unloadingPartyId === buyerId)
        : [];

      if (buyerStops.length > 0) {
        for (const stop of buyerStops) {
          if (stop.orderId) linkedOrderIds.add(stop.orderId);

          let stopRev = 0;
          if (stop.expectedAmount > 0) {
            stopRev = Number(stop.expectedAmount);
          } else if (Array.isArray(stop.stoneLines) && stop.stoneLines.length > 0) {
            stopRev = stop.stoneLines.reduce((sum, l) => {
              const sqft = (Number(l.sqftPerPiece) || (l.size === '3x3' ? 9 : 4)) * (Number(l.pieces) || 0);
              const rate = Number(l.ratePerSqft) || getRate(l, stop.district || buyerDistrict);
              return sum + (sqft * rate);
            }, 0);
          }

          tripRevenue += stopRev;
          tripPaid += ((stop.collectedCash || 0) + (stop.collectedOnline || 0));
        }
      } else if (t.unloadingPartyId === buyerId) {
        // Single drop trip for this buyer
        const rev = (t.stoneLines || []).reduce((sum, l) => {
          const sqft = (Number(l.sqftPerPiece) || (l.size === '3x3' ? 9 : 4)) * (Number(l.pieces) || 0);
          return sum + (sqft * getRate(l, buyerDistrict));
        }, 0);

        const paidOnTrip = Math.max(
          Number(t.amountPaid) || 0,
          (Number(t.partyToDriverCash) || 0) + (Number(t.partyToOwnerPhonePe) || 0)
        );

        tripRevenue += rev;
        tripPaid += paidOnTrip;
        tripDamage += (Number(t.damageDeduction) || 0);
      }
    }

    // 3. Compute revenue from unlinked orders (orders placed or confirmed not yet converted to trips)
    let unlinkedOrderRevenue = 0;
    let unlinkedOrderPaid = 0;

    for (const ord of orders) {
      if (!linkedOrderIds.has(ord.id)) {
        const ordRev = (ord.lines || []).reduce((sum, l) => {
          const sqft = (Number(l.sqftPerPiece) || (l.size === '3x3' ? 9 : 4)) * (Number(l.pieces) || 0);
          const rate = Number(l.ratePerSqft) || getRate(l, ord.district || buyerDistrict);
          return sum + (sqft * rate);
        }, 0);

        unlinkedOrderRevenue += ordRev;
        unlinkedOrderPaid += (Number(ord.amountPaid) || 0);
      }
    }

    // 4. Baseline party values if any
    const baseTotal = buyer.totalOrdered || 0;
    const basePaid = buyer.paid || 0;

    const totalOrdered = Math.max(Math.round(tripRevenue + unlinkedOrderRevenue), baseTotal);
    const totalPaid = Math.max(Math.round(tripPaid + unlinkedOrderPaid), basePaid);
    const totalDamage = Math.round(tripDamage);
    const remainingDue = Math.max(0, totalOrdered - totalPaid - totalDamage);

    // 5. Asynchronously keep UnloadingParty & User records up-to-date
    UnloadingParty.findOneAndUpdate(
      { id: buyerId },
      { totalOrdered, paid: totalPaid, pending: remainingDue }
    ).catch(e => console.warn('[buyerLedger] UnloadingParty sync warning:', e.message));

    if (buyer.userId) {
      User.findByIdAndUpdate(buyer.userId, {
        'buyerProfile.totalOrdered': totalOrdered,
        'buyerProfile.paid': totalPaid,
        'buyerProfile.pending': remainingDue
      }).catch(e => console.warn('[buyerLedger] User sync warning:', e.message));
    }

    return {
      matched: true,
      buyerId,
      buyerName: buyer.name,
      buyerPhone: buyer.phone,
      buyerDistrict,
      totalOrdersCount: orders.length,
      activeOrdersCount: orders.filter(o => ['placed', 'confirmed', 'dispatched'].includes(o.status)).length,
      totalOrdered,
      settlementsPaid: totalPaid,
      totalPaid,
      totalDamage,
      remainingDue,
      recentOrders: orders.slice(0, 5),
      activeTrips: allTrips.filter(t => t.status !== 'delivered' && t.status !== 'paid')
    };
  }
};
