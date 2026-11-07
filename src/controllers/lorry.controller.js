import { Lorry } from '../models/Lorry.js';
import { Trip } from '../models/Trip.js';
import { Driver } from '../models/Driver.js';
import { DistrictRate } from '../models/DistrictRate.js';
import { User } from '../models/User.js';

export const getLorries = async (req, res, next) => {
  try {
    const data = await Lorry.find({});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const getLorryById = async (req, res, next) => {
  try {
    const data = await Lorry.findOne({ id: req.params.id });
    if (!data) {
      return res.status(404).json({ message: 'Lorry not found' });
    }
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const getLorryStats = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cleanId = (id || '').replace(/[^a-zA-Z0-9]/g, '');

    const lorry = await Lorry.findOne({
      $or: [
        { id: id },
        { plate: id },
        { plate: new RegExp(cleanId, 'i') },
        { plate: new RegExp(id.trim(), 'i') }
      ]
    });

    if (!lorry) {
      return res.status(404).json({ success: false, message: 'Lorry not found' });
    }

    const [driver, trips, districtRates, buyerUsers] = await Promise.all([
      lorry.driverId ? Driver.findOne({ id: lorry.driverId }) : null,
      Trip.find({
        $or: [
          { lorryId: lorry.id },
          { lorryId: lorry.plate }
        ]
      }).sort({ date: -1, createdAt: -1 }),
      DistrictRate.find({}),
      User.find({ role: 'buyer' })
    ]);

    let totalRevenue = 0;
    let totalWages = 0;
    let fuelExpenses = 0;
    let tollExpenses = 0;
    let maintenanceExpenses = 0;
    let otherExpenses = 0;

    trips.forEach((trip) => {
      let tripRevenue = 0;
      if (Array.isArray(trip.stops) && trip.stops.length > 0) {
        tripRevenue = trip.stops.reduce((sSum, stop) => {
          if (Array.isArray(stop.stoneLines) && stop.stoneLines.length > 0) {
            return sSum + stop.stoneLines.reduce((lSum, line) => {
              const matchRate = districtRates.find(r => 
                r.district?.toLowerCase() === (stop.district || 'palakkad').toLowerCase() &&
                r.size === line.size &&
                r.thickness === line.thickness &&
                r.finish === line.finish
              );
              const rate = matchRate ? matchRate.ratePerSqft : (line.ratePerSqft || 40);
              return lSum + ((Number(line.sqftPerPiece) || 4) * (Number(line.pieces) || 0) * rate);
            }, 0);
          }
          return sSum + (stop.expectedAmount || 0);
        }, 0);
      } else {
        const buyer = buyerUsers.find(u => u.buyerProfile && u.buyerProfile.id === trip.unloadingPartyId);
        const buyerDistrict = buyer ? buyer.buyerProfile.district : null;
        tripRevenue = (trip.stoneLines || []).reduce((s, line) => {
          const matchRate = districtRates.find(r => 
            r.district?.toLowerCase() === (buyerDistrict || 'palakkad').toLowerCase() &&
            r.size === line.size &&
            r.thickness === line.thickness &&
            r.finish === line.finish
          );
          const rate = matchRate ? matchRate.ratePerSqft : (line.ratePerSqft || 40);
          return s + ((Number(line.sqftPerPiece) || 4) * (Number(line.pieces) || 0) * rate);
        }, 0);
      }
      if (tripRevenue === 0) {
        tripRevenue = trip.amountPaid || (trip.partyToDriverCash || 0) + (trip.partyToOwnerPhonePe || 0);
      }
      totalRevenue += tripRevenue;

      const tripWages = (trip.workerPayments || []).reduce((s, w) => s + (Number(w.amount) || 0), 0);
      totalWages += tripWages;

      (trip.expenses || []).forEach((e) => {
        const amt = Number(e.amount) || 0;
        const lbl = (e.label || '').toLowerCase();
        if (e.category === 'fuel' || lbl.includes('fuel') || lbl.includes('diesel') || lbl.includes('diseal') || lbl.includes('disel') || lbl.includes('deisel') || lbl.includes('petrol')) {
          fuelExpenses += amt;
        } else if (e.category === 'toll' || lbl.includes('toll') || lbl.includes('fastag')) {
          tollExpenses += amt;
        } else if (e.category === 'maintenance' || lbl.includes('repair') || lbl.includes('service') || lbl.includes('tyre')) {
          maintenanceExpenses += amt;
        } else if (e.category === 'worker_hamali' || e.category === 'bata_food' || lbl.includes('driver') || lbl.includes('bata')) {
          totalWages += amt;
        } else {
          otherExpenses += amt;
        }
      });
    });

    const totalExpenses = fuelExpenses + tollExpenses + maintenanceExpenses + otherExpenses + totalWages;
    const netProfit = totalRevenue - totalExpenses;
    const totalFuelLiters = fuelExpenses > 0 ? Math.round(fuelExpenses / 95) : 0;

    const activeTrip = trips.find(t => t.status === 'loading' || t.status === 'in-transit');

    const recentTrips = trips.slice(0, 5).map(t => ({
      id: t.id,
      code: t.code,
      status: t.status,
      date: t.date,
      origin: t.origin,
      unloadingPartyId: t.unloadingPartyId,
      amountPaid: t.amountPaid
    }));

    res.status(200).json({
      success: true,
      data: {
        lorry: {
          id: lorry.id,
          plate: lorry.plate,
          status: lorry.status,
          location: lorry.location,
          capacitySqft: lorry.capacitySqft,
          driverId: lorry.driverId,
          driverName: driver ? driver.name : null,
          addedOn: lorry.addedOn
        },
        summary: {
          totalTrips: trips.length,
          activeTrips: trips.filter(t => t.status === 'loading' || t.status === 'in-transit').length,
          deliveredTrips: trips.filter(t => t.status === 'delivered' || t.status === 'paid').length,
          totalRevenue,
          totalExpenses,
          totalWages,
          netProfit,
          totalFuelAmount: fuelExpenses,
          totalFuelLiters,
          capacitySqft: lorry.capacitySqft
        },
        expenseCategories: [
          { label: 'Fuel', amount: fuelExpenses },
          { label: 'Driver', amount: totalWages },
          { label: 'Toll', amount: tollExpenses },
          { label: 'Maintenance', amount: maintenanceExpenses },
          { label: 'Other', amount: otherExpenses }
        ],
        activeTrip: activeTrip ? {
          id: activeTrip.id,
          code: activeTrip.code,
          status: activeTrip.status,
          date: activeTrip.date,
          origin: activeTrip.origin
        } : null,
        recentTrips
      }
    });
  } catch (err) {
    next(err);
  }
};

export const createLorry = async (req, res, next) => {
  try {
    const newLorry = new Lorry(req.body);
    await newLorry.save();
    res.status(201).json(newLorry);
  } catch (err) {
    next(err);
  }
};

export const updateLorry = async (req, res, next) => {
  try {
    const updated = await Lorry.findOneAndUpdate(
      { id: req.params.id },
      req.body,
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: 'Lorry not found' });
    }
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
};

export const deleteLorry = async (req, res, next) => {
  try {
    const deleted = await Lorry.findOneAndDelete({ id: req.params.id });
    if (!deleted) {
      return res.status(404).json({ message: 'Lorry not found' });
    }
    res.status(200).json({ success: true, message: 'Lorry deleted' });
  } catch (err) {
    next(err);
  }
};
