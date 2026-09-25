import { StoneCatalog } from '../models/StoneCatalog.js';

const defaultCatalog = [
  {
    code: 'KB-22-30R',
    name: 'Kadapa 2x2 Natural Rough Split Paving',
    category: 'Black Stone',
    color: 'Charcoal Black',
    description: 'Authentic quarry-split Kadapa black stone with natural cleft texture. Provides superior grip under wet conditions, making it the top choice for Kerala courtyards and car porches.',
    imageUrl: '/catalog/s2.jpeg',
    availableSizes: ['2x2'],
    availableThicknesses: ['30mm'],
    finishes: ['rough'],
    baseRatePerSqft: 17,
    inStock: true
  },
  {
    code: 'KB-22-40P',
    name: 'Kadapa 2x2 Polished Patio & Walkway Tiles',
    category: 'Flooring',
    color: 'Deep Black',
    description: 'Precision-calibrated black limestone with smooth honed finish. Perfect balance of rich charcoal aesthetics, foot comfort, and modern architectural finish.',
    imageUrl: '/catalog/p1.jpeg',
    availableSizes: ['2x2'],
    availableThicknesses: ['40mm'],
    finishes: ['polish'],
    baseRatePerSqft: 19,
    inStock: true
  },
  {
    code: 'KB-22-50P',
    name: 'Kadapa 2x2 Heavy Mirror Polish Luxury Stone',
    category: 'Flooring',
    color: 'Jet Black Glass Sheen',
    description: 'Ultra-dense 50mm heavy-duty black stone with diamond-wheel mirror polishing. Imparts a luxurious glass-like black luster for grand residential halls and resorts.',
    imageUrl: '/catalog/p2.jpeg',
    availableSizes: ['2x2'],
    availableThicknesses: ['50mm'],
    finishes: ['polish'],
    baseRatePerSqft: 20,
    inStock: true
  },
  {
    code: 'KB-33-30R',
    name: 'Kadapa 3x3 Grand Format Rough Stone',
    category: 'Paving',
    color: 'Charcoal Black',
    description: 'Expansive 3ft by 3ft large format slabs covering 9 square feet per unit. Minimizes grout lines and accelerates installation for large landscaped grounds.',
    imageUrl: '/catalog/s1.jpeg',
    availableSizes: ['3x3'],
    availableThicknesses: ['30mm'],
    finishes: ['rough'],
    baseRatePerSqft: 18,
    inStock: true
  },
  {
    code: 'KB-33-40P',
    name: 'Kadapa 3x3 Premium Polished Slab',
    category: 'Paving',
    color: 'Deep Graphite Black',
    description: 'Sleek 3x3 polished black stone stepping slabs. Exceptional geometry and uniform thickness designed for modern garden walkways and contemporary stepped patios.',
    imageUrl: '/catalog/p3.jpeg',
    availableSizes: ['3x3'],
    availableThicknesses: ['40mm'],
    finishes: ['polish'],
    baseRatePerSqft: 20,
    inStock: true
  },
  {
    code: 'KB-33-50R',
    name: 'Kadapa 3x3 Heavy Duty 50mm Rough Block Slab',
    category: 'Slabs',
    color: 'Natural Quarry Black',
    description: 'Immense 50mm thickness capable of bearing loaded trucks, fire engines, and industrial forklifts without cracking. Features genuine natural split texture.',
    imageUrl: '/catalog/s3.jpeg',
    availableSizes: ['3x3'],
    availableThicknesses: ['50mm'],
    finishes: ['rough'],
    baseRatePerSqft: 18,
    inStock: true
  }
];

export const getCatalog = async (req, res, next) => {
  try {
    if (req.query.reseed === 'true') {
      await StoneCatalog.deleteMany({});
      await StoneCatalog.insertMany(defaultCatalog);
    }
    let items = await StoneCatalog.find({ inStock: true }).sort({ code: 1 });
    if (items.length === 0) {
      console.log('[Stone Catalog] Seeding default authentic Black Stone catalog varieties...');
      await StoneCatalog.insertMany(defaultCatalog);
      items = await StoneCatalog.find({ inStock: true }).sort({ code: 1 });
    }
    res.status(200).json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};

export const getCatalogItemByCode = async (req, res, next) => {
  try {
    const item = await StoneCatalog.findOne({ code: req.params.code.toUpperCase() });
    if (!item) {
      return res.status(404).json({ success: false, message: 'Stone variety not found' });
    }
    res.status(200).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

export const createCatalogItem = async (req, res, next) => {
  try {
    const newItem = new StoneCatalog(req.body);
    await newItem.save();
    res.status(201).json({ success: true, data: newItem });
  } catch (err) {
    next(err);
  }
};
