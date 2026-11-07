import mongoose from 'mongoose';

const stoneLineSchema = new mongoose.Schema({
  id: { type: String, default: null },
  loadingPartyId: { type: String, default: '' },
  size: { type: String, required: true },
  thickness: { type: String, default: '' },
  finish: { type: String, default: 'rough' },
  sqftPerPiece: { type: Number, default: 4 },
  pieces: { type: Number, required: true },
  ratePerSqft: { type: Number, default: 0 },
  unloadingPartyId: { type: String, default: null },
  orderId: { type: String, default: null },
  destination: { type: String, default: '' }
}, { _id: false, strict: false });

const loadingEntrySchema = new mongoose.Schema({
  id: { type: String, default: null },
  loadingDate: { type: String, default: '' },
  loadingTime: { type: String, default: '' },
  quarryName: { type: String, default: '' },
  quarryLocation: { type: String, default: 'Ramapuram' },
  loadingPartyId: { type: String, default: '' },
  supplierName: { type: String, default: '' },
  stoneType: { type: String, default: 'Kadapa Black Stone' },
  size: { type: String, default: '2x2' },
  thickness: { type: String, default: '40mm' },
  finish: { type: String, default: 'rough' },
  pieces: { type: Number, default: 0 },
  sqftPerPiece: { type: Number, default: 4 },
  totalSqft: { type: Number, default: 0 },
  ratePerSqft: { type: Number, default: 0 },
  ratePerPiece: { type: Number, default: 0 },
  totalLoadingValue: { type: Number, default: 0 },
  hamaliAmount: { type: Number, default: 0 },
  hamaliRatePerPiece: { type: Number, default: 0 },
  hamaliCalculationMode: { type: String, enum: ['lump', 'per_stone'], default: 'lump' },
  hamaliPaidBy: { type: String, default: 'owner' },
  hamaliPaymentMode: { type: String, default: 'cash' },
  hamaliStatus: { type: String, default: 'pending' },
  mamulluAmount: { type: Number, default: 0 },
  mamulluPaidBy: { type: String, default: 'owner' },
  otherExpenses: { type: Number, default: 0 },
  billNumber: { type: String, default: '' },
  notes: { type: String, default: '' },
  auditTrail: [{ editedAt: String, editedBy: String, reason: String, previousValues: Object }],
  supportingDocuments: [{ type: String }]
}, { _id: false, strict: false });

const unloadingEntrySchema = new mongoose.Schema({
  id: { type: String, default: null },
  unloadingPartyId: { type: String, default: '' },
  partyName: { type: String, default: '' },
  deliveryLocation: { type: String, default: '' },
  orderId: { type: String, default: null },
  deliveryDate: { type: String, default: '' },
  deliveryTime: { type: String, default: '' },
  stoneType: { type: String, default: 'Kadapa Black Stone' },
  size: { type: String, default: '2x2' },
  thickness: { type: String, default: '40mm' },
  finish: { type: String, default: 'rough' },
  piecesAssigned: { type: Number, default: 0 },
  contactPhone: { type: String, default: '' },
  invoiceNumber: { type: String, default: '' },
  cancellationReason: { type: String, default: '' },
  cancelledAt: { type: String, default: null },
  cancelledBy: { type: String, default: null },
  damageReason: { type: String, default: '' },
  auditTrail: [{ editedAt: String, editedBy: String, reason: String, previousValues: Object }],
  piecesLoaded: { type: Number, default: 0 },
  piecesDelivered: { type: Number, default: 0 },
  piecesRejected: { type: Number, default: 0 },
  piecesDamaged: { type: Number, default: 0 },
  piecesReturned: { type: Number, default: 0 },
  sqftDelivered: { type: Number, default: 0 },
  agreedRate: { type: Number, default: 0 },
  totalDeliveryAmount: { type: Number, default: 0 },
  amountReceived: { type: Number, default: 0 },
  amountReceivable: { type: Number, default: 0 },
  unloadingLabourCharges: { type: Number, default: 0 },
  proofOfDelivery: { type: String, default: '' },
  deliveryNotes: { type: String, default: '' },
  reassignedFromOrderId: { type: String, default: null },
  reassignmentId: { type: String, default: null },
  status: { type: String, enum: ['pending', 'partially_delivered', 'delivered', 'cancelled', 'rejected'], default: 'delivered' }
}, { _id: false, strict: false });

const tripStopSchema = new mongoose.Schema({
  stopNumber: { type: Number, default: 1 },
  unloadingPartyId: { type: String, default: '' },
  orderId: { type: String, default: null },
  buyerName: { type: String, default: '' },
  buyerPhone: { type: String, default: '' },
  district: { type: String, default: '' },
  deliveryLocation: { type: String, default: '' },
  stoneSummary: { type: String, default: '' },
  stoneLines: [stoneLineSchema],
  totalPieces: { type: Number, default: 0 },
  totalSqft: { type: Number, default: 0 },
  expectedAmount: { type: Number, default: 0 },
  collectedCash: { type: Number, default: 0 },
  collectedOnline: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'unloaded', 'skipped'], default: 'pending' },
  unloadedAt: { type: Date, default: null },
  notes: { type: String, default: '' }
}, { _id: false, strict: false });

const workerPaymentSchema = new mongoose.Schema({
  id: { type: String, default: null },
  loadingPartyId: { type: String, default: '' },
  amount: { type: Number, required: true },
  note: { type: String, default: '' },
  paidBy: { type: String, default: 'driver' }
}, { _id: false, strict: false });

const expenseLineSchema = new mongoose.Schema({
  id: { type: String, default: null },
  label: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, default: 'general' },
  paidBy: { type: String, default: 'driver' },
  paymentMode: { type: String, default: 'cash' },
  review: { type: String, enum: ['pending', 'approved', 'flagged'], default: 'pending' },
  notes: { type: String, default: '' },
  date: { type: String, default: '' }
}, { _id: false, strict: false });

const loadingPartyPaymentSchema = new mongoose.Schema({
  id: { type: String, default: null },
  loadingPartyId: { type: String, default: '' },
  amountPaid: { type: Number, required: true },
  paidBy: { type: String, enum: ['owner', 'driver'], default: 'owner' },
  status: { type: String, enum: ['paid', 'pending'], default: 'pending' },
  paymentMode: { type: String, enum: ['cash', 'phonepe', 'bank_transfer', 'unspecified'], default: 'unspecified' }
}, { _id: false, strict: false });

const returnSandLoadSchema = new mongoose.Schema({
  loadingLocation: { type: String, default: '' },
  loadingDate: { type: String, default: '' },
  supplierName: { type: String, default: '' },
  sandType: { type: String, default: 'River Sand' },
  weightTons: { type: Number, default: 0 },
  ratePerTon: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  advanceReceived: { type: Number, default: 0 },
  loadingExpense: { type: Number, default: 0 },
  dieselLitres: { type: Number, default: 0 },
  dieselAmount: { type: Number, default: 0 },
  tollCharges: { type: Number, default: 0 },
  supplierPayment: { type: Number, default: 0 },
  paymentMode: { type: String, default: 'cash' },
  supplierNotes: { type: String, default: '' },
  loadedAt: { type: String, default: '' }
}, { _id: false, strict: false });

const returnSandUnloadSchema = new mongoose.Schema({
  unloadingLocation: { type: String, default: '' },
  buyerName: { type: String, default: '' },
  buyerPhone: { type: String, default: '' },
  unloadDate: { type: String, default: '' },
  receivedWeightTons: { type: Number, default: 0 },
  weightDifferenceTons: { type: Number, default: 0 },
  ratePerTon: { type: Number, default: 0 },
  totalFreightAmount: { type: Number, default: 0 },
  cashCollectedByDriver: { type: Number, default: 0 },
  onlineToOwner: { type: Number, default: 0 },
  balanceReceivable: { type: Number, default: 0 },
  unloadingExpense: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  unloadedAt: { type: String, default: '' }
}, { _id: false, strict: false });

const directReturnDetailsSchema = new mongoose.Schema({
  returnDate: { type: String, default: '' },
  originLocation: { type: String, default: '' },
  destinationLocation: { type: String, default: '' },
  odometerKm: { type: Number, default: 0 },
  dieselAmount: { type: Number, default: 0 },
  tollAmount: { type: Number, default: 0 },
  driverBatta: { type: Number, default: 0 },
  otherExpenses: { type: Number, default: 0 },
  notes: { type: String, default: '' }
}, { _id: false, strict: false });

const vehicleReturnDetailsSchema = new mongoose.Schema({
  returnDate: { type: String, default: '' },
  returnTime: { type: String, default: '' },
  finalOdometerKm: { type: Number, default: 0 },
  totalRoundTripKm: { type: Number, default: 0 },
  parkedLocation: { type: String, default: 'Depot - Kadapa' },
  vehicleCondition: { type: String, default: 'Good' },
  driverHandoverNotes: { type: String, default: '' },
  keyHandedOver: { type: Boolean, default: true },
  verifiedBy: { type: String, default: 'Owner' }
}, { _id: false, strict: false });

const finalAuditSchema = new mongoose.Schema({
  auditedBy: { type: String, default: 'Owner' },
  auditDate: { type: String, default: '' },
  completedDate: { type: String, default: '' },
  completedTime: { type: String, default: '' },
  totalStonePiecesLoaded: { type: Number, default: 0 },
  totalStonePiecesDelivered: { type: Number, default: 0 },
  totalDamagedPieces: { type: Number, default: 0 },
  remainingPieces: { type: Number, default: 0 },
  reconciled: { type: Boolean, default: true },
  discrepancyReason: { type: String, default: '' },
  stoneRevenue: { type: Number, default: 0 },
  sandGrossRevenue: { type: Number, default: 0 },
  sandNetProfit: { type: Number, default: 0 },
  totalGrossRevenue: { type: Number, default: 0 },
  totalTripExpenses: { type: Number, default: 0 },
  netTripProfit: { type: Number, default: 0 },
  marginPercent: { type: Number, default: 0 },
  driverOpeningBalance: { type: Number, default: 0 },
  driverCashCollected: { type: Number, default: 0 },
  driverCashSpent: { type: Number, default: 0 },
  driverNetInHand: { type: Number, default: 0 },
  driverSettlementType: { type: String, default: 'carry_forward' },
  driverCashHandedToOwner: { type: Number, default: 0 },
  driverClosingBalanceForwarded: { type: Number, default: 0 },
  returnJourneyVerified: { type: Boolean, default: true },
  notes: { type: String, default: '' }
}, { _id: false, strict: false });

const tripSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  code: { type: String, required: true },
  lorryId: { type: String, required: true },
  driverId: { type: String, required: true },
  origin: { type: String, required: true },
  unloadingPartyId: { type: String, default: '' },
  unloadingPartyIds: [{ type: String }],
  status: {
    type: String,
    enum: [
      'draft',
      'assigned',
      'loading',
      'in-transit',
      'delivered',
      'paid',
      'return_loaded',
      'sand_unloaded',
      'direct_return',
      'returned_to_base',
      'final_audit_pending',
      'completed',
      'closed'
    ],
    default: 'loading'
  },
  date: { type: String, required: true },

  // Detailed Multi-Quarry & Multi-Party Entries
  loadingEntries: [loadingEntrySchema],
  unloadingEntries: [unloadingEntrySchema],

  // Backward-compatible structures
  stoneLines: [stoneLineSchema],
  stops: [tripStopSchema],
  workerPayments: [workerPaymentSchema],
  expenses: [expenseLineSchema],
  loadingPartyPayments: [loadingPartyPaymentSchema],

  // Financial aggregates
  amountPaid: { type: Number, default: 0 },
  partyToDriverCash: { type: Number, default: 0 },
  partyToOwnerPhonePe: { type: Number, default: 0 },
  damagedPieces: { type: Number, default: 0 },
  damageDeduction: { type: Number, default: 0 },
  unloadedPieces: { type: Number, default: 0 },
  shortageDeduction: { type: Number, default: 0 },
  unloadingNotes: { type: String, default: '' },
  unloadedDate: { type: String, default: '' },
  orderId: { type: String, default: null },
  orderIds: [{ type: String }],

  // Return Journey & Full Lifecycle
  returnPlan: { type: String, enum: ['sand_return', 'direct_return', null], default: null },
  returnSandLoad: { type: returnSandLoadSchema, default: null },
  returnSandUnload: { type: returnSandUnloadSchema, default: null },
  directReturnDetails: { type: directReturnDetailsSchema, default: null },
  vehicleReturnDetails: { type: vehicleReturnDetailsSchema, default: null },
  finalAudit: { type: finalAuditSchema, default: null },
  driverOpeningBalance: { type: Number, default: 0 },
  driverCashHandoverToOwner: { type: Number, default: 0 },
  driverClosingBalanceForwarded: { type: Number, default: 0 },
  driverSettlementType: { type: String, default: 'carry_forward' },
  completedDate: { type: String, default: '' },
  completedTime: { type: String, default: '' },
  completedBy: { type: String, default: 'Owner' }
}, { timestamps: true, strict: false });

tripSchema.index({ lorryId: 1, date: -1 });
tripSchema.index({ driverId: 1 });
tripSchema.index({ status: 1 });

export const Trip = mongoose.model('Trip', tripSchema);
