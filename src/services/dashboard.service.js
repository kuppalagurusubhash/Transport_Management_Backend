import { Trip } from '../models/Trip.js';
import { Order } from '../models/Order.js';
import { Lorry } from '../models/Lorry.js';
import { User } from '../models/User.js';
import { DistrictRate } from '../models/DistrictRate.js';

import mongoose from 'mongoose';

const mockOwnerStats = {
  summary: {
    totalTrips: 6,
    activeDrivers: 4,
    activeLorries: 4,
    pendingOrders: 3,
    totalRevenue: 284000,
    pendingPayments: 48000,
    totalExpenses: 54000,
    totalWages: 32000,
    netRevenue: 198000
  },
  fleetBreakdown: {
    active: 3,
    idle: 1,
    maintenance: 0,
    loading: 1,
    inTransit: 2
  },
  recentTrips: [
    {
      id: "t1",
      code: "TRP-1042",
      lorryId: "KL-07 AB 4521",
      driverId: "Suresh Kumar",
      status: "in-transit",
      date: "2026-07-01",
      revenue: 48000
    },
    {
      id: "t0",
      code: "TRP-1043",
      lorryId: "KL-10 EF 1234",
      driverId: "Mohan Singh",
      status: "loading",
      date: "2026-07-04",
      revenue: 52000
    }
  ],
  loadingPartyBalances: [
    { id: "lp1", name: "Sri Lakshmi Stone Quarry", location: "Ramapuram North", totalPurchased: 142000, paid: 120000, pending: 22000 },
    { id: "lp2", name: "Balaji Granites & Black Stone", location: "Ramapuram Bypass", totalPurchased: 98000, paid: 98000, pending: 0 }
  ],
  unloadingPartyBalances: [
    { id: "up1", name: "Malabar Builders & Developers", district: "Palakkad", totalOrdered: 132000, paid: 110000, pending: 22000, ordersCount: 4 },
    { id: "up2", name: "Green Valley Constructions", district: "Wayanad", totalOrdered: 88000, paid: 88000, pending: 0, ordersCount: 2 }
  ]
};

export const dashboardService = {
  async getOwnerStats() {
    if (mongoose.connection.readyState !== 1) {
      return mockOwnerStats;
    }

    const [
      allTrips,
      allOrders,
      allLorries,
      driverUsers,
      supervisorUsers,
      buyerUsers,
      districtRates
    ] = await Promise.all([
      Trip.find({}),
      Order.find({}),
      Lorry.find({}),
      User.find({ role: 'driver' }),
      User.find({ role: 'loading_supervisor' }),
      User.find({ role: 'buyer' }),
      DistrictRate.find({})
    ]);

    // Map User documents to the formats expected by downstream statistics logic
    const allDrivers = driverUsers.map(user => {
      if (!user.driverProfile) return null;
      return {
        id: user.driverProfile.id,
        name: user.name,
        email: user.username,
        phone: user.phone,
        lorryId: user.driverProfile.lorryId,
        status: user.driverProfile.status,
        joinedOn: user.driverProfile.joinedOn,
        tripsCompleted: user.driverProfile.tripsCompleted,
        supervisorId: user.driverProfile.supervisorId
      };
    }).filter(Boolean);

    const loadingParties = supervisorUsers.map(user => {
      if (!user.loadingPartyProfile) return null;
      const lpId = user.loadingPartyProfile.id;
      let totalPurchased = 0;
      for (const t of allTrips) {
        const partyLines = t.stoneLines.filter(line => line.loadingPartyId === lpId);
        const stoneValue = partyLines.reduce((sum, line) => {
          return sum + (line.sqftPerPiece * line.pieces * line.ratePerSqft);
        }, 0);
        totalPurchased += stoneValue;
      }

      let tripPaymentsSum = 0;
      for (const t of allTrips) {
        const partyPayments = t.loadingPartyPayments || [];
        const partyPaid = partyPayments
          .filter(p => p.loadingPartyId === lpId)
          .reduce((sum, p) => sum + (p.amountPaid || 0), 0);
        tripPaymentsSum += partyPaid;
      }

      const initialPaid = user.loadingPartyProfile.paid || 0;
      const totalPaid = initialPaid + tripPaymentsSum;
      const pending = Math.max(0, totalPurchased - totalPaid);

      return {
        id: lpId,
        name: user.loadingPartyProfile.name || user.name,
        location: user.loadingPartyProfile.location,
        totalPurchased,
        paid: totalPaid,
        pending,
        supervisorId: user._id
      };
    }).filter(Boolean);

    const unloadingParties = buyerUsers.map(user => {
      if (!user.buyerProfile) return null;
      const buyerId = user.buyerProfile.id;
      const buyerDistrict = user.buyerProfile.district;
      let totalOrdered = 0;
      let paid = 0;
      let pending = 0;

      for (const t of allTrips) {
        if (t.unloadingPartyId === buyerId) {
          const tripRevenue = t.stoneLines.reduce((sum, line) => {
            const matchRate = districtRates.find(r => 
              r.district === buyerDistrict &&
              r.size === line.size &&
              r.thickness === line.thickness &&
              r.finish === line.finish
            );
            const rate = matchRate ? matchRate.ratePerSqft : line.ratePerSqft;
            return sum + (line.sqftPerPiece * line.pieces * rate);
          }, 0);
          const tripPaid = t.amountPaid || 0;
          const damage = t.damageDeduction || 0;

          totalOrdered += tripRevenue;
          paid += tripPaid;
          pending += Math.max(0, tripRevenue - tripPaid - damage);
        }
      }

      const ordersCount = allOrders.filter(o => o.unloadingPartyId === buyerId).length;

      return {
        id: buyerId,
        name: user.name,
        district: buyerDistrict,
        totalOrdered,
        paid,
        pending,
        ordersCount,
        supervisorId: user.buyerProfile.supervisorId
      };
    }).filter(Boolean);

    // Revenue = sum of all stoneLine amounts across all non-loading trips using selling rates
    const totalRevenue = allTrips.reduce((sum, trip) => {
      const buyer = buyerUsers.find(u => u.buyerProfile && u.buyerProfile.id === trip.unloadingPartyId);
      const buyerDistrict = buyer ? buyer.buyerProfile.district : null;
      const tripRevenue = trip.stoneLines.reduce((s, line) => {
        const matchRate = districtRates.find(r => 
          r.district === buyerDistrict &&
          r.size === line.size &&
          r.thickness === line.thickness &&
          r.finish === line.finish
        );
        const rate = matchRate ? matchRate.ratePerSqft : line.ratePerSqft;
        return s + (line.sqftPerPiece * line.pieces * rate);
      }, 0);
      return sum + tripRevenue;
    }, 0);

    // Pending payments from unloading parties
    const pendingPayments = unloadingParties.reduce((sum, p) => sum + p.pending, 0);

    // Active lorries
    const activeLorries = allLorries.filter(l => l.status === 'active' || l.status === 'idle').length;
    const activeDrivers = allDrivers.filter(d => d.status === 'active').length;

    // Pending orders
    const pendingOrders = allOrders.filter(o => o.status === 'placed' || o.status === 'confirmed').length;

    // Stone purchase cost (from loading parties/quarries)
    const stoneCost = allTrips.reduce((sum, trip) => {
      const tripStoneCost = trip.stoneLines.reduce((s, line) => {
        return s + (line.sqftPerPiece * line.pieces * line.ratePerSqft);
      }, 0);
      return sum + tripStoneCost;
    }, 0);

    // Total operational expenses across all trips
    const opExpenses = allTrips.reduce((sum, trip) => {
      return sum + trip.expenses.reduce((s, e) => s + e.amount, 0);
    }, 0);

    // Total expenses include both operational expenses and stone purchase costs
    const totalExpenses = opExpenses + stoneCost;

    // Worker wages across all trips
    const totalWages = allTrips.reduce((sum, trip) => {
      return sum + trip.workerPayments.reduce((s, w) => s + w.amount, 0);
    }, 0);

    // Recent 5 trips
    const recentTrips = allTrips
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map(t => {
        const buyer = buyerUsers.find(u => u.buyerProfile && u.buyerProfile.id === t.unloadingPartyId);
        const buyerDistrict = buyer ? buyer.buyerProfile.district : null;
        const rev = t.stoneLines.reduce((s, line) => {
          const matchRate = districtRates.find(r => 
            r.district === buyerDistrict &&
            r.size === line.size &&
            r.thickness === line.thickness &&
            r.finish === line.finish
          );
          const rate = matchRate ? matchRate.ratePerSqft : line.ratePerSqft;
          return s + (line.sqftPerPiece * line.pieces * rate);
        }, 0);
        return {
          id: t.id,
          code: t.code,
          lorryId: t.lorryId,
          driverId: t.driverId,
          status: t.status,
          date: t.date,
          revenue: rev
        };
      });

    // Loading party balance summary
    const loadingPartyBalances = loadingParties.map(lp => ({
      id: lp.id,
      name: lp.name,
      location: lp.location,
      totalPurchased: lp.totalPurchased,
      paid: lp.paid,
      pending: lp.pending
    }));

    // Unloading party balance summary
    const unloadingPartyBalances = unloadingParties.map(up => ({
      id: up.id,
      name: up.name,
      district: up.district,
      totalOrdered: up.totalOrdered,
      paid: up.paid,
      pending: up.pending,
      ordersCount: up.ordersCount
    }));

    // Fleet breakdown
    const fleetBreakdown = {
      active: allLorries.filter(l => l.status === 'active').length,
      idle: allLorries.filter(l => l.status === 'idle').length,
      maintenance: allLorries.filter(l => l.status === 'maintenance').length,
      loading: allTrips.filter(t => t.status === 'loading').length,
      inTransit: allTrips.filter(t => t.status === 'in-transit').length
    };

    return {
      summary: {
        totalTrips: allTrips.length,
        activeDrivers,
        activeLorries,
        pendingOrders,
        totalRevenue,
        pendingPayments,
        totalExpenses,
        totalWages,
        netRevenue: totalRevenue - totalExpenses - totalWages
      },
      fleetBreakdown,
      recentTrips,
      loadingPartyBalances,
      unloadingPartyBalances
    };
  },

  async getLoadingStats(supervisorId) {
    const filter = supervisorId ? { _id: supervisorId, role: 'loading_supervisor' } : { role: 'loading_supervisor' };

    const [
      supervisedPartiesCount,
      activeLorriesCount,
      incomingOrdersCount
    ] = await Promise.all([
      User.countDocuments(filter),
      Lorry.countDocuments({ status: { $in: ['active', 'idle'] } }),
      Order.countDocuments({ status: { $in: ['placed', 'confirmed'] } })
    ]);

    return {
      supervisedPartiesCount,
      activeLorriesCount,
      incomingOrdersCount
    };
  },

  async getBuyerStats(buyerId) {
    if (!buyerId) throw new Error('buyerId (Unloading Party reference) is required');

    const [buyerUser, orders, trips, districtRates] = await Promise.all([
      User.findOne({ role: 'buyer', "buyerProfile.id": buyerId }),
      Order.find({ unloadingPartyId: buyerId }).sort({ createdAt: -1 }),
      Trip.find({ unloadingPartyId: buyerId }).sort({ date: -1 }),
      DistrictRate.find({})
    ]);

    if (!buyerUser || !buyerUser.buyerProfile) {
      throw new Error(`Buyer specification with id '${buyerId}' not found`);
    }

    let totalOrdered = 0;
    let paid = 0;
    let pending = 0;

    for (const t of trips) {
      const tripRevenue = t.stoneLines.reduce((sum, line) => {
        const matchRate = districtRates.find(r => 
          r.district === buyerUser.buyerProfile.district &&
          r.size === line.size &&
          r.thickness === line.thickness &&
          r.finish === line.finish
        );
        const rate = matchRate ? matchRate.ratePerSqft : line.ratePerSqft;
        return sum + (line.sqftPerPiece * line.pieces * rate);
      }, 0);
      const tripPaid = t.amountPaid || 0;
      const damage = t.damageDeduction || 0;

      totalOrdered += tripRevenue;
      paid += tripPaid;
      pending += Math.max(0, tripRevenue - tripPaid - damage);
    }

    return {
      buyer: {
        id: buyerUser.buyerProfile.id,
        name: buyerUser.name,
        district: buyerUser.buyerProfile.district,
        totalOrdered,
        paid,
        pending
      },
      orders,
      trips
    };
  }
};

