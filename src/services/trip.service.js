import { Trip } from '../models/Trip.js';
import { broadcastEvent } from '../sockets/socket.instance.js';

export const tripService = {
  async getAll() {
    return await Trip.find({}).sort({ date: -1 });
  },

  async getById(id) {
    return await Trip.findOne({ id });
  },

  async getByStatus(status) {
    return await Trip.find({ status }).sort({ date: -1 });
  },

  async create(data) {
    const newTrip = new Trip(data);
    await newTrip.save();

    // Broadcast new trip creation
    broadcastEvent('trip:created', newTrip);

    return newTrip;
  },

  async update(id, data) {
    const trip = await Trip.findOneAndUpdate({ id }, data, { new: true });

    // Broadcast trip update (e.g. status change, new load added)
    broadcastEvent('trip:updated', trip);

    return trip;
  },

  async dispatch(id) {
    const trip = await Trip.findOneAndUpdate(
      { id },
      { status: 'in-transit' },
      { new: true }
    );

    broadcastEvent('trip:dispatched', { tripId: id, status: 'in-transit' });

    return trip;
  }
};
