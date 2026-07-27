import { Lorry } from '../models/Lorry.js';

export const lorryService = {
  async getAll() {
    return await Lorry.find({}).sort({ status: 1 });
  },

  async getActive() {
    return await Lorry.find({ status: { $in: ['active', 'idle'] } });
  },

  async getById(id) {
    return await Lorry.findOne({ id });
  },

  async updateStatus(id, status) {
    return await Lorry.findOneAndUpdate({ id }, { status }, { new: true });
  }
};
