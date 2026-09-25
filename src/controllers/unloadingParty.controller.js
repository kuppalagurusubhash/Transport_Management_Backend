import { User } from '../models/User.js';
import { Trip } from '../models/Trip.js';
import { Order } from '../models/Order.js';
import { DistrictRate } from '../models/DistrictRate.js';
import { calculateBuyerFinancialsFromData } from '../services/buyerLedger.service.js';

const mapUserToUnloadingParty = (user, allTrips = [], allOrders = [], districtRates = []) => {
  if (!user || !user.buyerProfile) return null;
  const buyerId = user.buyerProfile.id;
  const buyerDistrict = user.buyerProfile.district;
  
  const fin = calculateBuyerFinancialsFromData({
    buyerId,
    buyerDistrict,
    baseTotalOrdered: user.buyerProfile.totalOrdered || 0,
    basePaid: user.buyerProfile.paid || 0,
    allTrips,
    allOrders,
    districtRates
  });

  return {
    _id: user._id,
    id: buyerId,
    name: user.name,
    district: buyerDistrict,
    totalOrdered: fin.totalOrdered,
    paid: fin.paid,
    pending: fin.pending,
    ordersCount: fin.ordersCount,
    supervisorId: user.buyerProfile.supervisorId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

export const getUnloadingParties = async (req, res, next) => {
  try {
    let filter = { role: 'buyer' };
    if (req.user && req.user.role === 'loading_supervisor') {
      filter["buyerProfile.supervisorId"] = req.user._id;
    } else if (req.user && req.user.role === 'buyer') {
      filter["buyerProfile.id"] = req.user.buyerRef;
    }
    const [users, allTrips, allOrders, districtRates] = await Promise.all([
      User.find(filter).populate('buyerProfile.supervisorId', 'username name role'),
      Trip.find({}),
      Order.find({}),
      DistrictRate.find({})
    ]);
    const data = users.map(user => mapUserToUnloadingParty(user, allTrips, allOrders, districtRates)).filter(Boolean);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const createUnloadingParty = async (req, res, next) => {
  try {
    const { id, name, district, totalOrdered, paid, pending, supervisorUsername } = req.body;

    if (!id || !name || !district) {
      return res.status(400).json({ success: false, message: 'id, name, and district are required' });
    }

    let supervisorId = null;

    if (supervisorUsername) {
      const supervisor = await User.findOne({ username: supervisorUsername });
      if (!supervisor) {
        return res.status(400).json({ success: false, message: `Supervisor with username '${supervisorUsername}' not found` });
      }
      supervisorId = supervisor._id;
    } else if (req.user && req.user.role === 'loading_supervisor') {
      supervisorId = req.user._id;
    }

    const buyerUsername = req.body.username || req.body.email || id.toLowerCase();
    const buyerPassword = req.body.password || 'password123';

    let user = await User.findOne({ username: buyerUsername });
    if (!user) {
      user = new User({
        username: buyerUsername,
        password: buyerPassword,
        role: 'buyer',
        name,
        phone: req.body.phone || '',
        buyerProfile: {
          id,
          district,
          totalOrdered: totalOrdered || 0,
          paid: paid || 0,
          pending: pending || 0,
          supervisorId
        }
      });
    } else {
      user.name = name;
      if (req.body.phone) user.phone = req.body.phone;
      user.buyerProfile = {
        id,
        district,
        totalOrdered: totalOrdered || user.buyerProfile?.totalOrdered || 0,
        paid: paid || user.buyerProfile?.paid || 0,
        pending: pending || user.buyerProfile?.pending || 0,
        supervisorId
      };
    }

    await user.save();
    res.status(201).json({ success: true, data: mapUserToUnloadingParty(user) });
  } catch (err) {
    next(err);
  }
};

