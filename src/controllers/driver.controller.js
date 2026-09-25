import { User } from '../models/User.js';

const mapUserToDriver = (user) => {
  if (!user || !user.driverProfile) return null;
  return {
    _id: user._id,
    id: user.driverProfile.id,
    name: user.name,
    email: user.username,
    phone: user.phone,
    lorryId: user.driverProfile.lorryId,
    status: user.driverProfile.status,
    joinedOn: user.driverProfile.joinedOn,
    tripsCompleted: user.driverProfile.tripsCompleted,
    supervisorId: user.driverProfile.supervisorId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

export const getDrivers = async (req, res, next) => {
  try {
    let filter = { role: 'driver' };
    // If authenticated and is a supervisor, only show their drivers
    if (req.user && req.user.role === 'loading_supervisor') {
      filter["driverProfile.supervisorId"] = req.user._id;
    } else if (req.user && req.user.role === 'driver') {
      filter["driverProfile.id"] = req.user.driverRef;
    }
    const users = await User.find(filter).populate('driverProfile.supervisorId', 'username name role');
    const data = users.map(mapUserToDriver).filter(Boolean);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const createDriver = async (req, res, next) => {
  try {
    const { id, name, email, password, phone, lorryId, status, joinedOn, supervisorUsername } = req.body;

    if (!id || !name || !email || !password || !phone || !joinedOn) {
      return res.status(400).json({ success: false, message: 'id, name, email, password, phone, and joinedOn are required' });
    }

    let supervisorId = null;

    // 1. If supervisorUsername is explicitly specified, find that supervisor
    if (supervisorUsername) {
      const supervisor = await User.findOne({ username: supervisorUsername });
      if (!supervisor) {
        return res.status(400).json({ success: false, message: `Supervisor with username '${supervisorUsername}' not found` });
      }
      supervisorId = supervisor._id;
    }
    // 2. Otherwise, if the logged-in user is a supervisor, default to them
    else if (req.user && req.user.role === 'loading_supervisor') {
      supervisorId = req.user._id;
    }

    const existingUser = await User.findOne({ username: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username/Email already taken' });
    }

    const newUser = new User({
      username: email.toLowerCase(),
      password,
      role: 'driver',
      name,
      phone,
      driverProfile: {
        id,
        lorryId: lorryId || null,
        status: status || 'idle',
        joinedOn,
        tripsCompleted: 0,
        supervisorId
      }
    });

    await newUser.save();

    res.status(201).json({ success: true, data: mapUserToDriver(newUser) });
  } catch (err) {
    next(err);
  }
};

export const getDriverById = async (req, res, next) => {
  try {
    const user = await User.findOne({ role: 'driver', "driverProfile.id": req.params.id }).populate('driverProfile.supervisorId', 'username name role');
    if (!user) {
      return res.status(404).json({ message: 'Driver not found' });
    }
    res.status(200).json(mapUserToDriver(user));
  } catch (err) {
    next(err);
  }
};

export const updateDriver = async (req, res, next) => {
  try {
    const user = await User.findOne({ role: 'driver', "driverProfile.id": req.params.id });
    if (!user || !user.driverProfile) {
      return res.status(404).json({ message: 'Driver not found' });
    }
    const updates = req.body;

    if (updates.name) user.name = updates.name;
    if (updates.phone) user.phone = updates.phone;
    if (updates.email) user.username = updates.email.toLowerCase();
    if (updates.password && updates.password.trim() !== '') {
      user.password = updates.password;
    }

    for (const key of Object.keys(updates)) {
      if (['lorryId', 'status', 'joinedOn', 'tripsCompleted'].includes(key)) {
        user.driverProfile[key] = updates[key];
      }
      if (key === 'supervisorUsername') {
        const supervisor = await User.findOne({ username: updates.supervisorUsername });
        if (supervisor) {
          user.driverProfile.supervisorId = supervisor._id;
        }
      }
    }

    await user.save();
    res.status(200).json(mapUserToDriver(user));
  } catch (err) {
    next(err);
  }
};

export const deleteDriver = async (req, res, next) => {
  try {
    const ADMIN_EMAIL = 'subhash.cropnow@gmail.com';
    const requesterUsername = req.user?.username?.toLowerCase();
    
    if (!requesterUsername || requesterUsername !== ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: `Access denied: Only administrator (${ADMIN_EMAIL}) can delete driver accounts.`
      });
    }

    const userToDelete = await User.findOne({ role: 'driver', "driverProfile.id": req.params.id });
    if (!userToDelete) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    // Free up assigned lorry if any
    const lorryId = userToDelete.driverProfile?.lorryId;
    if (lorryId) {
      try {
        const { Lorry } = await import('../models/Lorry.js');
        await Lorry.findOneAndUpdate({ id: lorryId }, { driverId: null, status: 'idle' });
      } catch (lorryErr) {
        console.warn('[deleteDriver] Could not unassign lorry:', lorryErr.message);
      }
    }

    await User.findByIdAndDelete(userToDelete._id);
    res.status(200).json({ success: true, message: 'Driver account deleted successfully' });
  } catch (err) {
    next(err);
  }
};


