import mongoose from 'mongoose';

const orderReassignmentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  originalOrderId: { type: String, required: true },
  originalCustomerId: { type: String, required: true },
  originalCustomerName: { type: String, default: '' },
  alternativeCustomerId: { type: String, required: true },
  alternativeCustomerName: { type: String, default: '' },
  tripId: { type: String, default: '' },
  lorryPlate: { type: String, default: '' },
  cancellationReason: { type: String, required: true },
  cancellationDate: { type: String, required: true },
  reassignmentDate: { type: String, required: true },
  reassignedBy: { type: String, default: 'Owner' },
  originalRate: { type: Number, default: 0 },
  newAgreedRate: { type: Number, required: true },
  originalQuantityPieces: { type: Number, default: 0 },
  reassignedQuantityPieces: { type: Number, required: true },
  stoneType: { type: String, default: 'Kadapa Black Stone' },
  size: { type: String, default: '2x2' },
  thickness: { type: String, default: '40mm' },
  finish: { type: String, default: 'rough' },
  newDeliveryLocation: { type: String, required: true },
  priceDifference: { type: Number, default: 0 },
  extraTransportCost: { type: Number, default: 0 },
  extraHamaliCost: { type: Number, default: 0 },
  otherExpenses: { type: Number, default: 0 },
  status: { type: String, enum: ['reassigned', 'completed', 'cancelled'], default: 'reassigned' },
  notes: { type: String, default: '' }
}, { timestamps: true });

orderReassignmentSchema.index({ originalOrderId: 1 });
orderReassignmentSchema.index({ alternativeCustomerId: 1 });
orderReassignmentSchema.index({ tripId: 1 });

export const OrderReassignment = mongoose.model('OrderReassignment', orderReassignmentSchema);
