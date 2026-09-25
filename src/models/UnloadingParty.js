import mongoose from 'mongoose';

const unloadingPartySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name: { type: String, required: true },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  district: { type: String, required: true },
  totalOrdered: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  pending: { type: Number, default: 0 },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

export const UnloadingParty = mongoose.model('UnloadingParty', unloadingPartySchema, 'unloadingparties');
