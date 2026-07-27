import mongoose from 'mongoose';

const stoneLineSchema = new mongoose.Schema({
  id: { type: String, required: true },
  loadingPartyId: { type: String, required: true },
  size: { type: String, required: true },
  thickness: { type: String, required: true },
  finish: { type: String, enum: ['polish', 'rough'], required: true },
  sqftPerPiece: { type: Number, required: true },
  pieces: { type: Number, required: true },
  ratePerSqft: { type: Number, required: true }
});

const workerPaymentSchema = new mongoose.Schema({
  id: { type: String, required: true },
  loadingPartyId: { type: String, required: true },
  amount: { type: Number, required: true },
  note: { type: String, default: '' }
});

const expenseLineSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, required: true },
  amount: { type: Number, required: true },
  review: { type: String, enum: ['pending', 'approved', 'flagged'], default: 'pending' }
});

const loadingPartyPaymentSchema = new mongoose.Schema({
  id: { type: String, required: true },
  loadingPartyId: { type: String, required: true },
  amountPaid: { type: Number, required: true },
  paidBy: { type: String, enum: ['owner', 'driver'], default: 'owner' },
  status: { type: String, enum: ['paid', 'pending'], default: 'pending' },
  paymentMode: { type: String, enum: ['cash', 'phonepe', 'bank_transfer', 'unspecified'], default: 'unspecified' }
});

const tripSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  code: { type: String, required: true },
  lorryId: { type: String, required: true },
  driverId: { type: String, required: true },
  origin: { type: String, required: true },
  unloadingPartyId: { type: String, required: true },
  status: { type: String, enum: ['loading', 'in-transit', 'delivered', 'paid'], default: 'loading' },
  date: { type: String, required: true },
  stoneLines: [stoneLineSchema],
  workerPayments: [workerPaymentSchema],
  expenses: [expenseLineSchema],
  loadingPartyPayments: [loadingPartyPaymentSchema],
  amountPaid: { type: Number, default: 0 },
  partyToDriverCash: { type: Number, default: 0 },
  partyToOwnerPhonePe: { type: Number, default: 0 },
  damagedPieces: { type: Number, default: 0 },
  damageDeduction: { type: Number, default: 0 },
  orderId: { type: String, default: null }
}, { timestamps: true });

export const Trip = mongoose.model('Trip', tripSchema);
