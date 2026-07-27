import mongoose from 'mongoose';

const districtRateSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  district: { type: String, required: true },
  size: { type: String, required: true },
  thickness: { type: String, required: true },
  finish: { type: String, required: true },
  ratePerSqft: { type: Number, required: true }
}, { timestamps: true });

export const DistrictRate = mongoose.model('DistrictRate', districtRateSchema);
