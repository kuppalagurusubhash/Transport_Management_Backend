import mongoose from 'mongoose';

const orderLineSchema = new mongoose.Schema({
  id: { type: String, required: true },
  size: { type: String, required: true },
  thickness: { type: String, required: true },
  finish: { type: String, enum: ['polish', 'rough'], required: true },
  sqftPerPiece: { type: Number, required: true },
  pieces: { type: Number, required: true },
  ratePerSqft: { type: Number, required: true }
});

const orderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  code: { type: String, required: true },
  unloadingPartyId: { type: String, required: true },
  district: { type: String, required: true },
  status: { type: String, enum: ['placed', 'confirmed', 'dispatched', 'delivered', 'paid'], default: 'placed' },
  placedAt: { type: String, required: true },
  lines: [orderLineSchema],
  amountPaid: { type: Number, default: 0 }
}, { timestamps: true });

export const Order = mongoose.model('Order', orderSchema);
