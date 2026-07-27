import { User } from '../models/User.js';
import { Trip } from '../models/Trip.js';

const mapUserToLoadingParty = (user, allTrips = []) => {
  if (!user || !user.loadingPartyProfile) return null;
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
    _id: user._id,
    id: lpId,
    name: user.loadingPartyProfile.name || user.name,
    location: user.loadingPartyProfile.location,
    totalPurchased,
    paid: totalPaid,
    pending,
    supervisorId: {
      _id: user._id,
      username: user.username,
      name: user.name,
      role: user.role
    },
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

export const getLoadingParties = async (req, res, next) => {
  try {
    let filter = { role: 'loading_supervisor' };
    if (req.user && req.user.role === 'loading_supervisor') {
      filter._id = req.user._id;
    }
    const [users, allTrips] = await Promise.all([
      User.find(filter),
      Trip.find({})
    ]);
    const data = users.map(user => mapUserToLoadingParty(user, allTrips)).filter(Boolean);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const createLoadingParty = async (req, res, next) => {
  try {
    const { id, name, location, totalPurchased, paid, pending, supervisorUsername } = req.body;

    if (!id || !name || !location) {
      return res.status(400).json({ success: false, message: 'id, name, and location are required' });
    }

    if (!location.trim().toLowerCase().startsWith('ramapuram')) {
      return res.status(400).json({ success: false, message: 'Quarry (Loading Party) must be located in Ramapuram only' });
    }

    let supervisor = null;

    if (supervisorUsername) {
      supervisor = await User.findOne({ username: supervisorUsername });
      if (!supervisor) {
        supervisor = new User({
          username: supervisorUsername,
          password: 'password123', // default password
          role: 'loading_supervisor',
          name: supervisorUsername.charAt(0).toUpperCase() + supervisorUsername.slice(1) + ' Supervisor'
        });
      }
    } else if (req.user && req.user.role === 'loading_supervisor') {
      supervisor = req.user;
    }

    if (!supervisor) {
      return res.status(400).json({ success: false, message: 'No supervisor specified or authenticated' });
    }

    supervisor.loadingPartyProfile = {
      id,
      name,
      location,
      totalPurchased: totalPurchased || 0,
      paid: paid || 0,
      pending: pending || 0
    };

    await supervisor.save();
    res.status(201).json({ success: true, data: mapUserToLoadingParty(supervisor) });
  } catch (err) {
    next(err);
  }
};

export const deleteLoadingParty = async (req, res, next) => {
  try {
    const { id } = req.params;
    const supervisor = await User.findOne({ role: 'loading_supervisor', "loadingPartyProfile.id": id });
    if (!supervisor) {
      return res.status(404).json({ success: false, message: 'Quarry (Loading Party) not found' });
    }
    const data = mapUserToLoadingParty(supervisor);
    supervisor.loadingPartyProfile = undefined;
    await supervisor.save();
    res.status(200).json({ success: true, message: 'Quarry deleted successfully', data });
  } catch (err) {
    next(err);
  }
};

export const getLoadingPartyById = async (req, res, next) => {
  try {
    const [user, allTrips] = await Promise.all([
      User.findOne({ role: 'loading_supervisor', "loadingPartyProfile.id": req.params.id }),
      Trip.find({})
    ]);
    if (!user) {
      return res.status(404).json({ message: 'Quarry not found' });
    }
    res.status(200).json(mapUserToLoadingParty(user, allTrips));
  } catch (err) {
    next(err);
  }
};

export const updateLoadingParty = async (req, res, next) => {
  try {
    const user = await User.findOne({ role: 'loading_supervisor', "loadingPartyProfile.id": req.params.id });
    if (!user || !user.loadingPartyProfile) {
      return res.status(404).json({ message: 'Quarry not found' });
    }
    const updates = req.body;
    if (updates.location && !updates.location.trim().toLowerCase().startsWith('ramapuram')) {
      return res.status(400).json({ message: 'Quarry (Loading Party) must be located in Ramapuram only' });
    }
    for (const key of Object.keys(updates)) {
      if (['name', 'location', 'totalPurchased', 'paid', 'pending'].includes(key)) {
        user.loadingPartyProfile[key] = updates[key];
      }
    }
    await user.save();
    const allTrips = await Trip.find({});
    res.status(200).json(mapUserToLoadingParty(user, allTrips));
  } catch (err) {
    next(err);
  }
};

