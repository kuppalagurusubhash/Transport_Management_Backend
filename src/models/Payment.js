import mongoose from 'mongoose';

const paymentAllocationSchema = new mongoose.Schema({
  tripId: { type: String, default: '' },
  orderId: { type: String, default: '' },
  loadingEntryId: { type: String, default: '' },
  unloadingEntryId: { type: String, default: '' },
  allocatedAmount: { type: Number, required: true },
  note: { type: String, default: '' }
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  partyId: { type: String, required: true },
  partyType: { type: String, enum: ['supplier', 'customer'], required: true },
  partyName: { type: String, default: '' },
  direction: { type: String, enum: ['payable_out', 'receivable_in'], required: true },
  amount: { type: Number, required: true },
  date: { type: String, required: true },
  method: { type: String, enum: ['cash', 'phonepe', 'bank_transfer', 'cheque', 'other'], default: 'cash' },
  reference: { type: String, default: '' },
  notes: { type: String, default: '' },
  paidBy: { type: String, default: 'owner' },
  createdBy: { type: String, default: 'Owner' },
  allocations: [paymentAllocationSchema],
  status: { type: String, enum: ['completed', 'reversed'], default: 'completed' }
}, { timestamps: true });

paymentSchema.index({ partyId: 1, date: -1 });
paymentSchema.index({ partyType: 1 });
paymentSchema.index({ reference: 1 });

export const Payment = mongoose.model('Payment', paymentSchema);
