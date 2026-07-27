import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  kind: { type: String, enum: ['order', 'payment'], default: 'order' },
  title: { type: String, required: true },
  body: { type: String, required: true },
  time: { type: String, required: true },
  read: { type: Boolean, default: false },
  orderId: { type: String, default: null }
}, { timestamps: true });

export const Notification = mongoose.model('Notification', notificationSchema);
