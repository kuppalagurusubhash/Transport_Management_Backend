import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const driverProfileSchema = new mongoose.Schema({
  id: { type: String, required: true },
  lorryId: { type: String, default: null },
  status: { type: String, enum: ['active', 'idle', 'off-duty'], default: 'idle' },
  joinedOn: { type: String, required: true },
  tripsCompleted: { type: Number, default: 0 },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: false });

const buyerProfileSchema = new mongoose.Schema({
  id: { type: String, required: true },
  district: { type: String, required: true },
  totalOrdered: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  pending: { type: Number, default: 0 },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: false });

const loadingPartyProfileSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  location: { type: String, required: true },
  totalPurchased: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  pending: { type: Number, default: 0 }
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['owner', 'driver', 'loading_supervisor', 'buyer'],
    default: 'driver'
  },
  name: { type: String, required: true },
  phone: { type: String, default: '' },
  driverProfile: { type: driverProfileSchema, default: null },
  buyerProfile: { type: buyerProfileSchema, default: null },
  loadingPartyProfile: { type: loadingPartyProfileSchema, default: null }
}, { timestamps: true });

// Setup virtual getters for driverRef and buyerRef for compatibility
userSchema.virtual('driverRef').get(function () {
  return this.driverProfile ? this.driverProfile.id : null;
});

userSchema.virtual('buyerRef').get(function () {
  return this.buyerProfile ? this.buyerProfile.id : null;
});

// Configure toObject and toJSON options to include virtual properties
userSchema.set('toObject', { virtuals: true });
userSchema.set('toJSON', { virtuals: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password helper
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Automatically synchronize with drivers, loadingparties, and unloadingparties collections
userSchema.post('save', async function (doc) {
  try {
    const { syncUserToEntityCollection } = await import('../services/entitySync.service.js');
    await syncUserToEntityCollection(doc);
  } catch (err) {
    console.error('[User post-save sync error]:', err.message);
  }
});

userSchema.post('findOneAndDelete', async function (doc) {
  if (!doc) return;
  try {
    const { deleteUserFromEntityCollection } = await import('../services/entitySync.service.js');
    await deleteUserFromEntityCollection(doc);
  } catch (err) {
    console.error('[User post-delete sync error]:', err.message);
  }
});

export const User = mongoose.model('User', userSchema);

