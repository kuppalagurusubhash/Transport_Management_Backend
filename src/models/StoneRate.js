import mongoose from 'mongoose';

const stoneRateSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  size: { type: String, required: true },
  thickness: { type: String, required: true },
  finish: { type: String, required: true },
  ratePerSqft: { type: Number, required: true }
}, { timestamps: true });

export const StoneRate = mongoose.model('StoneRate', stoneRateSchema);
