import mongoose from 'mongoose';

const loadingPartySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name: { type: String, required: true },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  location: { type: String, required: true },
  totalPurchased: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  pending: { type: Number, default: 0 },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

export const LoadingParty = mongoose.model('LoadingParty', loadingPartySchema, 'loadingparties');
