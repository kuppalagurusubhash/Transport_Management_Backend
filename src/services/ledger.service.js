import { Trip } from '../models/Trip.js';
import { Order } from '../models/Order.js';
import { Payment } from '../models/Payment.js';
import { LoadingParty } from '../models/LoadingParty.js';
import { UnloadingParty } from '../models/UnloadingParty.js';
import { DistrictRate } from '../models/DistrictRate.js';
import { User } from '../models/User.js';

export const ledgerService = {
  /**
   * Resolves a party entity (either LoadingParty or UnloadingParty).
   */
  async resolveParty(partyId) {
    if (!partyId) return null;

    // Check loading party
    const lp = await LoadingParty.findOne({ id: partyId }) ||
      await LoadingParty.findOne({ name: new RegExp('^' + partyId + '$', 'i') });
    if (lp) {
      return {
        id: lp.id,
        name: lp.name,
        role: 'supplier',
        location: lp.location,
        phone: lp.phone || '',
        email: lp.email || '',
        totalPurchased: lp.totalPurchased || 0,
        paid: lp.paid || 0,
        pending: lp.pending || 0
      };
    }

    // Check unloading party
    const up = await UnloadingParty.findOne({ id: partyId }) ||
      await UnloadingParty.findOne({ name: new RegExp('^' + partyId + '$', 'i') });
    if (up) {
      return {
        id: up.id,
        name: up.name,
        role: 'customer',
        district: up.district,
        phone: up.phone || '',
        email: up.email || '',
        totalOrdered: up.totalOrdered || 0,
        paid: up.paid || 0,
        pending: up.pending || 0
      };
    }

    // Fallback: check users
    const userLp = await User.findOne({ 'loadingPartyProfile.id': partyId });
    if (userLp && userLp.loadingPartyProfile) {
      return {
        id: userLp.loadingPartyProfile.id,
        name: userLp.loadingPartyProfile.name || userLp.name,
        role: 'supplier',
        location: userLp.loadingPartyProfile.location || 'Ramapuram',
        phone: userLp.phone || '',
        email: userLp.email || '',
        totalPurchased: userLp.loadingPartyProfile.totalPurchased || 0,
        paid: userLp.loadingPartyProfile.paid || 0,
        pending: userLp.loadingPartyProfile.pending || 0
      };
    }

    const userBuyer = await User.findOne({ 'buyerProfile.id': partyId });
    if (userBuyer && userBuyer.buyerProfile) {
      return {
        id: userBuyer.buyerProfile.id,
        name: userBuyer.name,
        role: 'customer',
        district: userBuyer.buyerProfile.district || 'Palakkad',
        phone: userBuyer.phone || '',
        email: userBuyer.email || '',
        totalOrdered: userBuyer.buyerProfile.totalOrdered || 0,
        paid: userBuyer.buyerProfile.paid || 0,
        pending: userBuyer.buyerProfile.pending || 0
      };
    }

    return null;
  },

  /**
   * Generates Supplier / Loading Party Ledger.
   */
  async getSupplierLedger(partyId, options = {}) {
    const { startDate, endDate, tripId, lorryId, search } = options;

    const party = await this.resolveParty(partyId) || { id: partyId, name: partyId, role: 'supplier', location: 'Ramapuram' };

    // Find all trips with stone lines or loading entries for this party
    const tripFilter = {
      $or: [
        { 'loadingEntries.loadingPartyId': partyId },
        { 'stoneLines.loadingPartyId': partyId }
      ]
    };
    if (tripId) tripFilter.id = tripId;
    if (lorryId) tripFilter.lorryId = lorryId;

    const [allTrips, directPayments] = await Promise.all([
      Trip.find(tripFilter).sort({ date: 1, createdAt: 1 }).lean(),
      Payment.find({
        partyId,
        partyType: 'supplier',
        direction: 'payable_out',
        status: { $ne: 'reversed' }
      }).sort({ date: 1, createdAt: 1 }).lean()
    ]);

    // Build raw transaction entries
    const transactions = [];

    // Map direct payments by tripId or loadingEntryId
    const paymentsByTrip = new Map();
    const paymentsByEntry = new Map();
    const unallocatedPayments = [];

    for (const p of directPayments) {
      if (Array.isArray(p.allocations) && p.allocations.length > 0) {
        for (const alloc of p.allocations) {
          if (alloc.loadingEntryId) {
            const list = paymentsByEntry.get(alloc.loadingEntryId) || [];
            list.push({ ...p, allocatedAmount: alloc.allocatedAmount });
            paymentsByEntry.set(alloc.loadingEntryId, list);
          } else if (alloc.tripId) {
            const list = paymentsByTrip.get(alloc.tripId) || [];
            list.push({ ...p, allocatedAmount: alloc.allocatedAmount });
            paymentsByTrip.set(alloc.tripId, list);
          }
        }
      } else {
        unallocatedPayments.push(p);
      }
    }

    for (const trip of allTrips) {
      const tripDate = trip.date || (trip.createdAt ? new Date(trip.createdAt).toISOString().slice(0, 10) : '2026-10-01');
      const tripCode = trip.code || trip.id;
      const lorryPlate = trip.lorryId || 'AP-XX-1234';

      // 1. Process loading entries if present
      if (Array.isArray(trip.loadingEntries) && trip.loadingEntries.length > 0) {
        const matchingEntries = trip.loadingEntries.filter(e => e.loadingPartyId === partyId);

        for (const entry of matchingEntries) {
          const entryDate = entry.loadingDate || tripDate;
          const entryPieces = Number(entry.pieces) || 0;
          const sqftPerPiece = Number(entry.sqftPerPiece) || (entry.size === '3x3' ? 9 : 4);
          const totalSqft = entry.totalSqft || (entryPieces * sqftPerPiece);
          const rate = Number(entry.ratePerPiece) || (Number(entry.ratePerSqft) ? entry.ratePerSqft * sqftPerPiece : 0) || 0;
          const purchaseAmount = Number(entry.totalLoadingValue) || (totalSqft * (Number(entry.ratePerSqft) || 18));
          const hamali = Number(entry.hamaliAmount) || 0;
          const otherExp = Number(entry.otherExpenses) || Number(entry.mamulluAmount) || 0;
          const grossAmount = purchaseAmount + hamali + otherExp;

          // Allocated payments
          const entryPayments = paymentsByEntry.get(entry.id) || [];
          let paidAmount = entryPayments.reduce((sum, p) => sum + (p.allocatedAmount || p.amount || 0), 0);

          // Check legacy loadingPartyPayments on trip
          if (paidAmount === 0 && Array.isArray(trip.loadingPartyPayments)) {
            const legacyPaid = trip.loadingPartyPayments
              .filter(lp => lp.loadingPartyId === partyId)
              .reduce((s, lp) => s + (Number(lp.amountPaid) || 0), 0);
            paidAmount += legacyPaid;
          }

          const bal = Math.max(0, grossAmount - paidAmount);

          transactions.push({
            id: entry.id || ('txn-' + Date.now() + '-' + Math.random()),
            type: 'purchase',
            date: entryDate,
            tripId: trip.id,
            tripCode,
            lorryPlate,
            quarryName: entry.quarryName || party.name || 'Quarry',
            quarryLocation: entry.quarryLocation || party.location || 'Ramapuram',
            stoneItem: (entry.stoneType || 'Kadapa Stone') + ' (' + (entry.size || '2x2') + ' ' + (entry.thickness || '40mm') + ' ' + (entry.finish || 'rough') + ')',
            pieces: entryPieces,
            sqft: totalSqft,
            rate,
            purchaseAmount,
            hamaliAmount: hamali,
            otherExpenses: otherExp,
            grossAmount,
            paidAmount,
            balance: bal,
            paymentDate: entryPayments[0]?.date || (paidAmount > 0 ? entryDate : ''),
            paymentMethod: entryPayments[0]?.method || (entry.hamaliPaymentMode || 'cash'),
            reference: entryPayments[0]?.reference || entry.billNumber || '',
            billNumber: entry.billNumber || '',
            status: bal === 0 ? 'cleared' : (paidAmount > 0 ? 'partial' : 'pending'),
            notes: entry.notes || ''
          });
        }
      } else if (Array.isArray(trip.stoneLines) && trip.stoneLines.length > 0) {
        // Fallback to legacy stoneLines
        const matchingLines = trip.stoneLines.filter(l => l.loadingPartyId === partyId);

        for (const line of matchingLines) {
          const pieces = Number(line.pieces) || 0;
          const sqftPerPiece = Number(line.sqftPerPiece) || (line.size === '3x3' ? 9 : 4);
          const totalSqft = pieces * sqftPerPiece;
          const rate = Number(line.ratePerSqft) || 18;
          const purchaseAmount = totalSqft * rate;

          // Check legacy payments on trip
          let paidAmount = 0;
          if (Array.isArray(trip.loadingPartyPayments)) {
            paidAmount = trip.loadingPartyPayments
              .filter(lp => lp.loadingPartyId === partyId)
              .reduce((s, lp) => s + (Number(lp.amountPaid) || 0), 0);
          }
          const tripPayments = paymentsByTrip.get(trip.id) || [];
          paidAmount += tripPayments.reduce((s, p) => s + (p.allocatedAmount || p.amount || 0), 0);

          const bal = Math.max(0, purchaseAmount - paidAmount);

          transactions.push({
            id: line.id || ('sl-' + trip.id),
            type: 'purchase',
            date: tripDate,
            tripId: trip.id,
            tripCode,
            lorryPlate,
            quarryName: party.name || 'Quarry',
            quarryLocation: party.location || 'Ramapuram',
            stoneItem: 'Kadapa Stone (' + line.size + ' ' + line.thickness + ' ' + line.finish + ')',
            pieces,
            sqft: totalSqft,
            rate,
            purchaseAmount,
            hamaliAmount: 0,
            otherExpenses: 0,
            grossAmount: purchaseAmount,
            paidAmount,
            balance: bal,
            paymentDate: tripPayments[0]?.date || (paidAmount > 0 ? tripDate : ''),
            paymentMethod: tripPayments[0]?.method || 'phonepe',
            reference: tripPayments[0]?.reference || '',
            status: bal === 0 ? 'cleared' : (paidAmount > 0 ? 'partial' : 'pending'),
            notes: ''
          });
        }
      }
    }

    // Add standalone payments that were not tied to a specific trip line
    for (const p of unallocatedPayments) {
      transactions.push({
        id: p.id || ('pay-' + p._id),
        type: 'payment',
        date: p.date,
        tripId: '',
        tripCode: '-',
        lorryPlate: '-',
        quarryName: party.name || 'Quarry',
        quarryLocation: party.location || 'Ramapuram',
        stoneItem: 'Direct Supplier Payment / Advance',
        pieces: 0,
        sqft: 0,
        rate: 0,
        purchaseAmount: 0,
        hamaliAmount: 0,
        otherExpenses: 0,
        grossAmount: 0,
        paidAmount: Number(p.amount) || 0,
        balance: 0,
        paymentDate: p.date,
        paymentMethod: p.method || 'phonepe',
        reference: p.reference || '',
        billNumber: '',
        status: 'cleared',
        notes: p.notes || ''
      });
    }

    // Sort chronologically
    transactions.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Apply date and search filters
    let openingBalance = 0;
    const filteredTransactions = [];

    for (const t of transactions) {
      const isBeforeStart = startDate && t.date < startDate;
      const isAfterEnd = endDate && t.date > endDate;
      const matchesSearch = !search ||
        (t.stoneItem && t.stoneItem.toLowerCase().includes(search.toLowerCase())) ||
        (t.tripCode && t.tripCode.toLowerCase().includes(search.toLowerCase())) ||
        (t.lorryPlate && t.lorryPlate.toLowerCase().includes(search.toLowerCase())) ||
        (t.reference && t.reference.toLowerCase().includes(search.toLowerCase())) ||
        (t.quarryName && t.quarryName.toLowerCase().includes(search.toLowerCase()));

      if (isBeforeStart) {
        openingBalance += (t.grossAmount - t.paidAmount);
      } else if (!isAfterEnd && matchesSearch) {
        filteredTransactions.push(t);
      }
    }

    // Calculate running balance and totals
    let runningBalance = openingBalance;
    let totalPurchases = 0;
    let totalCharges = 0;
    let totalPaid = 0;
    let totalPieces = 0;

    for (const t of filteredTransactions) {
      totalPurchases += t.purchaseAmount;
      totalCharges += (t.hamaliAmount + t.otherExpenses);
      totalPaid += t.paidAmount;
      totalPieces += t.pieces;

      runningBalance += (t.grossAmount - t.paidAmount);
      t.runningBalance = runningBalance;
    }

    const closingBalance = runningBalance;

    return {
      party: {
        id: party.id,
        name: party.name,
        role: 'supplier',
        location: party.location || 'Ramapuram',
        phone: party.phone || '',
        email: party.email || ''
      },
      period: {
        startDate: startDate || (transactions[0]?.date || 'All Time'),
        endDate: endDate || (transactions[transactions.length - 1]?.date || 'Present')
      },
      summary: {
        openingBalance,
        totalPurchases,
        totalCharges,
        grossTotal: totalPurchases + totalCharges,
        totalPaid,
        closingBalance: Math.max(0, closingBalance),
        totalPieces,
        transactionCount: filteredTransactions.length,
        lastTransactionDate: filteredTransactions[filteredTransactions.length - 1]?.date || ''
      },
      transactions: filteredTransactions
    };
  },

  /**
   * Generates Customer / Kerala Unloading Party Ledger.
   */
  async getCustomerLedger(partyId, options = {}) {
    const { startDate, endDate, tripId, lorryId, search } = options;

    const party = await this.resolveParty(partyId) || { id: partyId, name: partyId, role: 'customer', district: 'Palakkad' };
    const partyDistrict = party.district || 'Palakkad';

    const [allTrips, allOrders, directPayments, districtRates] = await Promise.all([
      Trip.find({
        $or: [
          { unloadingPartyId: partyId },
          { unloadingPartyIds: partyId },
          { 'unloadingEntries.unloadingPartyId': partyId },
          { 'stops.unloadingPartyId': partyId },
          { 'stoneLines.unloadingPartyId': partyId }
        ]
      }).sort({ date: 1, createdAt: 1 }).lean(),
      Order.find({ unloadingPartyId: partyId }).sort({ placedAt: 1, createdAt: 1 }).lean(),
      Payment.find({
        partyId,
        partyType: 'customer',
        direction: 'receivable_in',
        status: { $ne: 'reversed' }
      }).sort({ date: 1, createdAt: 1 }).lean(),
      DistrictRate.find({}).lean()
    ]);

    const getSellingRate = (line, dist = partyDistrict) => {
      const match = districtRates.find(r =>
        r.district.toLowerCase() === dist.toLowerCase() &&
        r.size === line.size &&
        r.thickness === line.thickness &&
        r.finish === line.finish
      );
      if (match) return match.ratePerSqft;
      return line.ratePerSqft || (line.size === '3x3' ? 42 : 40);
    };

    const transactions = [];
    const linkedTripIds = new Set();
    const linkedOrderIds = new Set();

    // Map direct payments
    const paymentsByTrip = new Map();
    const unallocatedPayments = [];

    for (const p of directPayments) {
      if (Array.isArray(p.allocations) && p.allocations.length > 0) {
        for (const alloc of p.allocations) {
          if (alloc.tripId) {
            const list = paymentsByTrip.get(alloc.tripId) || [];
            list.push({ ...p, allocatedAmount: alloc.allocatedAmount });
            paymentsByTrip.set(alloc.tripId, list);
          }
        }
      } else {
        unallocatedPayments.push(p);
      }
    }

    // 1. Process Trips
    for (const trip of allTrips) {
      linkedTripIds.add(trip.id);
      if (trip.orderId) linkedOrderIds.add(trip.orderId);
      if (Array.isArray(trip.orderIds)) trip.orderIds.forEach(id => linkedOrderIds.add(id));

      const tripDate = trip.date || (trip.createdAt ? new Date(trip.createdAt).toISOString().slice(0, 10) : '2026-10-01');
      const tripCode = trip.code || trip.id;
      const lorryPlate = trip.lorryId || 'AP-XX-1234';

      // Multi-party unloading entries check
      if (Array.isArray(trip.unloadingEntries) && trip.unloadingEntries.length > 0) {
        const matchingEntries = trip.unloadingEntries.filter(e => e.unloadingPartyId === partyId);

        for (const entry of matchingEntries) {
          if (entry.orderId) linkedOrderIds.add(entry.orderId);

          const deliveryDate = entry.deliveryDate || tripDate;
          const piecesDelivered = Number(entry.piecesDelivered) || 0;
          const sqftPerPiece = entry.size === '3x3' ? 9 : 4;
          const sqftDelivered = entry.sqftDelivered || (piecesDelivered * sqftPerPiece);
          const agreedRate = Number(entry.agreedRate) || getSellingRate(entry, partyDistrict);
          const invoiceAmount = Number(entry.totalDeliveryAmount) || (sqftDelivered * agreedRate);
          const damageDeduction = (Number(entry.piecesDamaged) || 0) * agreedRate * sqftPerPiece;

          // Received amounts
          const entryPayments = paymentsByTrip.get(trip.id) || [];
          let amountReceived = entryPayments.reduce((s, p) => s + (p.allocatedAmount || p.amount || 0), 0);
          if (amountReceived === 0) {
            amountReceived = Number(entry.amountReceived) || 0;
          }

          const bal = Math.max(0, invoiceAmount - amountReceived - damageDeduction);

          transactions.push({
            id: entry.id || ('un-' + trip.id + '-' + Math.random()),
            type: 'sale_delivery',
            date: deliveryDate,
            tripId: trip.id,
            tripCode,
            lorryPlate,
            deliveryLocation: entry.deliveryLocation || partyDistrict,
            stoneItem: (entry.stoneType || 'Kadapa Stone') + ' (' + (entry.size || '2x2') + ' ' + (entry.thickness || '40mm') + ' ' + (entry.finish || 'rough') + ')',
            pieces: piecesDelivered,
            piecesDamaged: Number(entry.piecesDamaged) || 0,
            damageReason: entry.damageReason || '',
            sqft: sqftDelivered,
            agreedRate,
            invoiceAmount,
            damageDeduction,
            amountReceived,
            balance: bal,
            paymentDate: entryPayments[0]?.date || (amountReceived > 0 ? deliveryDate : ''),
            paymentMethod: entryPayments[0]?.method || 'phonepe',
            reference: entryPayments[0]?.reference || entry.invoiceNumber || '',
            invoiceNumber: entry.invoiceNumber || '',
            status: entry.status || (bal === 0 ? 'delivered' : 'pending'),
            deliveryStatus: entry.status || 'delivered',
            notes: entry.deliveryNotes || ''
          });
        }
      } else if (Array.isArray(trip.stops) && trip.stops.length > 0) {
        // Multi-drop stops check
        const matchingStops = trip.stops.filter(s => s.unloadingPartyId === partyId);

        for (const stop of matchingStops) {
          if (stop.orderId) linkedOrderIds.add(stop.orderId);

          let stopInv = 0;
          let stopPieces = stop.totalPieces || 0;
          let stopSqft = stop.totalSqft || 0;

          if (stop.expectedAmount > 0) {
            stopInv = Number(stop.expectedAmount);
          } else if (Array.isArray(stop.stoneLines) && stop.stoneLines.length > 0) {
            stopPieces = stop.stoneLines.reduce((s, l) => s + (Number(l.pieces) || 0), 0);
            stopSqft = stop.stoneLines.reduce((s, l) => s + ((l.sqftPerPiece || 4) * (Number(l.pieces) || 0)), 0);
            stopInv = stop.stoneLines.reduce((sum, l) => {
              const sq = (l.sqftPerPiece || 4) * (Number(l.pieces) || 0);
              const r = Number(l.ratePerSqft) || getSellingRate(l, stop.district || partyDistrict);
              return sum + (sq * r);
            }, 0);
          }

          const stopPaid = (Number(stop.collectedCash) || 0) + (Number(stop.collectedOnline) || 0);
          const bal = Math.max(0, stopInv - stopPaid);

          transactions.push({
            id: stop.id || ('stop-' + trip.id),
            type: 'sale_delivery',
            date: tripDate,
            tripId: trip.id,
            tripCode,
            lorryPlate,
            deliveryLocation: stop.deliveryLocation || stop.district || partyDistrict,
            stoneItem: stop.stoneSummary || 'Kadapa Black Stone',
            pieces: stopPieces,
            piecesDamaged: 0,
            sqft: stopSqft,
            agreedRate: stopSqft > 0 ? Math.round(stopInv / stopSqft) : 40,
            invoiceAmount: stopInv,
            damageDeduction: 0,
            amountReceived: stopPaid,
            balance: bal,
            paymentDate: stopPaid > 0 ? tripDate : '',
            paymentMethod: stop.collectedOnline > 0 ? 'phonepe' : 'cash',
            reference: '',
            status: stop.status === 'unloaded' ? 'delivered' : 'pending',
            deliveryStatus: stop.status || 'delivered',
            notes: stop.notes || ''
          });
        }
      } else if (trip.unloadingPartyId === partyId) {
        // Single drop trip fallback
        const lines = trip.stoneLines || [];
        const totalPieces = lines.reduce((s, l) => s + (Number(l.pieces) || 0), 0);
        const totalSqft = lines.reduce((s, l) => s + ((l.sqftPerPiece || 4) * (Number(l.pieces) || 0)), 0);
        const inv = lines.reduce((sum, l) => {
          const sq = (l.sqftPerPiece || 4) * (Number(l.pieces) || 0);
          const r = Number(l.ratePerSqft) || getSellingRate(l, partyDistrict);
          return sum + (sq * r);
        }, 0);

        const paid = Math.max(
          Number(trip.amountPaid) || 0,
          (Number(trip.partyToDriverCash) || 0) + (Number(trip.partyToOwnerPhonePe) || 0)
        );
        const damage = Number(trip.damageDeduction) || 0;
        const bal = Math.max(0, inv - paid - damage);

        transactions.push({
          id: 'single-' + trip.id,
          type: 'sale_delivery',
          date: tripDate,
          tripId: trip.id,
          tripCode,
          lorryPlate,
          deliveryLocation: partyDistrict,
          stoneItem: lines.length > 0 ? ('Kadapa Stone (' + lines[0].size + ' ' + lines[0].thickness + ')') : 'Kadapa Stone',
          pieces: totalPieces,
          piecesDamaged: Number(trip.damagedPieces) || 0,
          sqft: totalSqft,
          agreedRate: totalSqft > 0 ? Math.round(inv / totalSqft) : 40,
          invoiceAmount: inv,
          damageDeduction: damage,
          amountReceived: paid,
          balance: bal,
          paymentDate: paid > 0 ? tripDate : '',
          paymentMethod: (trip.partyToOwnerPhonePe || 0) > 0 ? 'phonepe' : 'cash',
          reference: '',
          status: trip.status === 'delivered' || trip.status === 'paid' ? 'delivered' : 'pending',
          deliveryStatus: trip.status,
          notes: trip.unloadingNotes || ''
        });
      }
    }

    // 2. Unlinked Orders
    for (const ord of allOrders) {
      if (!linkedOrderIds.has(ord.id) && ord.status !== 'cancelled') {
        const ordDate = ord.placedAt ? ord.placedAt.slice(0, 10) : '2026-10-01';
        const lines = ord.lines || [];
        const totalPieces = lines.reduce((s, l) => s + (Number(l.pieces) || 0), 0);
        const totalSqft = lines.reduce((s, l) => s + ((l.sqftPerPiece || 4) * (Number(l.pieces) || 0)), 0);
        const inv = lines.reduce((sum, l) => {
          const sq = (l.sqftPerPiece || 4) * (Number(l.pieces) || 0);
          const r = Number(l.ratePerSqft) || getSellingRate(l, ord.district || partyDistrict);
          return sum + (sq * r);
        }, 0);

        const paid = Number(ord.amountPaid) || 0;
        const bal = Math.max(0, inv - paid);

        transactions.push({
          id: ord.id,
          type: 'order_booking',
          date: ordDate,
          tripId: '',
          tripCode: ord.code || ord.id,
          lorryPlate: '-',
          deliveryLocation: ord.district || partyDistrict,
          stoneItem: lines.length > 0 ? ('Ordered: ' + lines[0].size + ' ' + lines[0].thickness) : 'Stone Order',
          pieces: totalPieces,
          piecesDamaged: 0,
          sqft: totalSqft,
          agreedRate: totalSqft > 0 ? Math.round(inv / totalSqft) : 40,
          invoiceAmount: inv,
          damageDeduction: 0,
          amountReceived: paid,
          balance: bal,
          paymentDate: paid > 0 ? ordDate : '',
          paymentMethod: 'phonepe',
          reference: '',
          status: ord.status,
          deliveryStatus: ord.status,
          notes: ord.notes || ''
        });
      }
    }

    // 3. Standalone Receipts
    for (const p of unallocatedPayments) {
      transactions.push({
        id: p.id || ('rcpt-' + p._id),
        type: 'receipt',
        date: p.date,
        tripId: '',
        tripCode: '-',
        lorryPlate: '-',
        deliveryLocation: partyDistrict,
        stoneItem: 'Direct Customer Payment / Advance Received',
        pieces: 0,
        piecesDamaged: 0,
        sqft: 0,
        agreedRate: 0,
        invoiceAmount: 0,
        damageDeduction: 0,
        amountReceived: Number(p.amount) || 0,
        balance: 0,
        paymentDate: p.date,
        paymentMethod: p.method || 'phonepe',
        reference: p.reference || '',
        invoiceNumber: '',
        status: 'completed',
        deliveryStatus: 'completed',
        notes: p.notes || ''
      });
    }

    transactions.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    let openingBalance = 0;
    const filteredTransactions = [];

    for (const t of transactions) {
      const isBeforeStart = startDate && t.date < startDate;
      const isAfterEnd = endDate && t.date > endDate;
      const matchesSearch = !search ||
        (t.stoneItem && t.stoneItem.toLowerCase().includes(search.toLowerCase())) ||
        (t.tripCode && t.tripCode.toLowerCase().includes(search.toLowerCase())) ||
        (t.lorryPlate && t.lorryPlate.toLowerCase().includes(search.toLowerCase())) ||
        (t.reference && t.reference.toLowerCase().includes(search.toLowerCase())) ||
        (t.deliveryLocation && t.deliveryLocation.toLowerCase().includes(search.toLowerCase()));

      if (isBeforeStart) {
        openingBalance += (t.invoiceAmount - t.amountReceived - t.damageDeduction);
      } else if (!isAfterEnd && matchesSearch) {
        filteredTransactions.push(t);
      }
    }

    let runningBalance = openingBalance;
    let totalInvoiced = 0;
    let totalReceived = 0;
    let totalDamages = 0;
    let totalPieces = 0;

    for (const t of filteredTransactions) {
      totalInvoiced += t.invoiceAmount;
      totalReceived += t.amountReceived;
      totalDamages += t.damageDeduction;
      totalPieces += t.pieces;

      runningBalance += (t.invoiceAmount - t.amountReceived - t.damageDeduction);
      t.runningBalance = runningBalance;
    }

    const closingBalance = runningBalance;

    return {
      party: {
        id: party.id,
        name: party.name,
        role: 'customer',
        district: party.district || 'Palakkad',
        phone: party.phone || '',
        email: party.email || ''
      },
      period: {
        startDate: startDate || (transactions[0]?.date || 'All Time'),
        endDate: endDate || (transactions[transactions.length - 1]?.date || 'Present')
      },
      summary: {
        openingBalance,
        totalInvoiced,
        totalReceived,
        totalDamages,
        closingBalance: Math.max(0, closingBalance),
        totalPieces,
        transactionCount: filteredTransactions.length,
        lastTransactionDate: filteredTransactions[filteredTransactions.length - 1]?.date || ''
      },
      transactions: filteredTransactions
    };
  },

  /**
   * Unified entry point to get party ledger by partyId (auto-detects role or honors explicit role parameter).
   */
  async getLedger(partyId, options = {}) {
    const party = await this.resolveParty(partyId);
    const role = options.role || (party ? party.role : 'customer');

    if (role === 'supplier') {
      return this.getSupplierLedger(partyId, options);
    } else {
      return this.getCustomerLedger(partyId, options);
    }
  }
};
