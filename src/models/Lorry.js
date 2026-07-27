import mongoose from 'mongoose';

const lorrySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  plate: { type: String, required: true },
  driverId: { type: String, default: null },
  status: { type: String, enum: ['active', 'idle', 'maintenance', 'sold'], default: 'idle' },
  location: { type: String, required: true },
  capacitySqft: { type: Number, required: true },
  addedOn: { type: String, required: true }
}, { timestamps: true });

export const Lorry = mongoose.model('Lorry', lorrySchema);
