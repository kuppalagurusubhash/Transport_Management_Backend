import mongoose from 'mongoose';

const stoneCatalogSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: { type: String, default: 'Natural Limestone' },
  color: { type: String, default: 'Natural' },
  description: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  availableSizes: [{ type: String }],
  availableThicknesses: [{ type: String }],
  finishes: [{ type: String }],
  baseRatePerSqft: { type: Number, required: true },
  inStock: { type: Boolean, default: true }
}, { timestamps: true });

export const StoneCatalog = mongoose.model('StoneCatalog', stoneCatalogSchema, 'stonecatalog');
