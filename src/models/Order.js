import mongoose from 'mongoose';

const orderLineSchema = new mongoose.Schema({
  id: { type: String, required: true },
  size: { type: String, required: true },
  thickness: { type: String, required: true },
  finish: { type: String, enum: ['polish', 'rough'], required: true },
  sqftPerPiece: { type: Number, required: true },
  pieces: { type: Number, required: true },
  ratePerSqft: { type: Number, required: true }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  code: { type: String, required: true },
  unloadingPartyId: { type: String, required: true },
  district: { type: String, required: true },
  status: {
    type: String,
    enum: [
      'draft',
      'placed',
      'confirmed',
      'loading',
      'in-transit',
      'reassignment_required',
      'reassigned',
      'partially_delivered',
      'delivered',
      'paid',
      'cancelled',
      'closed'
    ],
    default: 'placed'
  },
  placedAt: { type: String, required: true },
  lines: [orderLineSchema],
  amountPaid: { type: Number, default: 0 },
  source: { type: String, enum: ['online', 'manual'], default: 'manual' },
  notes: { type: String, default: '' },

  // Assigned logistics
  tripId: { type: String, default: null },
  lorryPlate: { type: String, default: null },
  driverId: { type: String, default: null },

  // Delivery tracking
  deliveredPieces: { type: Number, default: 0 },
  damagedPieces: { type: Number, default: 0 },
  unloadedAt: { type: String, default: null },
  proofOfDeliveryUrl: { type: String, default: '' },

  // Cancellation & Alternative Reassignment Tracking
  cancellationReason: { type: String, default: '' },
  cancelledAt: { type: String, default: null },
  cancelledBy: { type: String, default: null },
  reassignmentId: { type: String, default: null },
  alternativePartyId: { type: String, default: null },
  originalPartyId: { type: String, default: null },
  reassignedAt: { type: String, default: null },
  newAgreedRate: { type: Number, default: null },
  priceDifference: { type: Number, default: 0 },
  extraLogisticsCost: { type: Number, default: 0 }
}, { timestamps: true, strict: false });

orderSchema.index({ unloadingPartyId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ tripId: 1 });

export const Order = mongoose.model('Order', orderSchema);
