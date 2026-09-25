import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name: { type: String, required: true },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  lorryId: { type: String, default: null },
  status: { type: String, enum: ['active', 'idle', 'off-duty'], default: 'idle' },
  joinedOn: { type: String, required: true },
  tripsCompleted: { type: Number, default: 0 },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

export const Driver = mongoose.model('Driver', driverSchema, 'drivers');
