import { User } from '../models/User.js';

export const driverService = {
  async getAll() {
    const users = await User.find({ role: 'driver' }).sort({ "driverProfile.status": 1 });
    return users.map(user => {
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
  },

  async getById(id) {
    const user = await User.findOne({ role: 'driver', "driverProfile.id": id });
    if (!user || !user.driverProfile) return null;
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
  },

  async updateStatus(id, status) {
    const user = await User.findOneAndUpdate(
      { role: 'driver', "driverProfile.id": id },
      { $set: { "driverProfile.status": status } },
      { new: true }
    );
    if (!user || !user.driverProfile) return null;
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
  }
};

