import mongoose from 'mongoose';
import dns from 'dns/promises';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { User } from '../models/User.js';
import { StoneRate } from '../models/StoneRate.js';
import { Order } from '../models/Order.js';
import { Trip } from '../models/Trip.js';
import { Lorry } from '../models/Lorry.js';
import { Notification } from '../models/Notification.js';
import { DistrictRate } from '../models/DistrictRate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use ipv4first to help with Atlas SRV DNS resolution
dns.setDefaultResultOrder('ipv4first');
mongoose.set('bufferCommands', false); // Fail fast when disconnected

const defaultStoneRates = [
  { id: 'sp1', size: '2x2', thickness: '30mm', finish: 'rough', ratePerSqft: 17 },
  { id: 'sp2', size: '2x2', thickness: '40mm', finish: 'polish', ratePerSqft: 19 },
  { id: 'sp3', size: '2x2', thickness: '50mm', finish: 'polish', ratePerSqft: 20 },
  { id: 'sp4', size: '3x3', thickness: '30mm', finish: 'rough', ratePerSqft: 18 },
  { id: 'sp5', size: '3x3', thickness: '40mm', finish: 'polish', ratePerSqft: 20 },
  { id: 'sp6', size: '3x3', thickness: '50mm', finish: 'rough', ratePerSqft: 18 }
];

const ensureDefaultStoneRates = async () => {
  try {
    const count = await StoneRate.countDocuments();
    if (count === 0) {
      console.log('[Database Seed] Seeding default stone rates...');
      await StoneRate.insertMany(defaultStoneRates);
      console.log('[Database Seed] Default stone rates seeded successfully.');
    } else {
      console.log('[Database Seed] Stone rates already populated.');
    }
  } catch (err) {
    console.error(`[Database Seed] Error seeding default stone rates: ${err.message}`);
  }
};

const defaultDistrictRates = [
  // Palakkad
  { id: 'dr_plk_1', district: 'Palakkad', size: '2x2', thickness: '30mm', finish: 'rough', ratePerSqft: 38 },
  { id: 'dr_plk_2', district: 'Palakkad', size: '2x2', thickness: '40mm', finish: 'polish', ratePerSqft: 42 },
  { id: 'dr_plk_3', district: 'Palakkad', size: '2x2', thickness: '50mm', finish: 'polish', ratePerSqft: 40 },
  { id: 'dr_plk_4', district: 'Palakkad', size: '3x3', thickness: '30mm', finish: 'rough', ratePerSqft: 40 },
  { id: 'dr_plk_5', district: 'Palakkad', size: '3x3', thickness: '40mm', finish: 'polish', ratePerSqft: 45 },
  { id: 'dr_plk_6', district: 'Palakkad', size: '3x3', thickness: '50mm', finish: 'rough', ratePerSqft: 42 },

  // Wayanad
  { id: 'dr_wyd_1', district: 'Wayanad', size: '2x2', thickness: '30mm', finish: 'rough', ratePerSqft: 42 },
  { id: 'dr_wyd_2', district: 'Wayanad', size: '2x2', thickness: '40mm', finish: 'polish', ratePerSqft: 47 },
  { id: 'dr_wyd_3', district: 'Wayanad', size: '2x2', thickness: '50mm', finish: 'polish', ratePerSqft: 48 },
  { id: 'dr_wyd_4', district: 'Wayanad', size: '3x3', thickness: '30mm', finish: 'rough', ratePerSqft: 45 },
  { id: 'dr_wyd_5', district: 'Wayanad', size: '3x3', thickness: '40mm', finish: 'polish', ratePerSqft: 50 },
  { id: 'dr_wyd_6', district: 'Wayanad', size: '3x3', thickness: '50mm', finish: 'rough', ratePerSqft: 46 },

  // Kannur
  { id: 'dr_knr_1', district: 'Kannur', size: '2x2', thickness: '30mm', finish: 'rough', ratePerSqft: 44 },
  { id: 'dr_knr_2', district: 'Kannur', size: '2x2', thickness: '40mm', finish: 'polish', ratePerSqft: 48 },
  { id: 'dr_knr_3', district: 'Kannur', size: '2x2', thickness: '50mm', finish: 'polish', ratePerSqft: 50 },
  { id: 'dr_knr_4', district: 'Kannur', size: '3x3', thickness: '30mm', finish: 'rough', ratePerSqft: 47 },
  { id: 'dr_knr_5', district: 'Kannur', size: '3x3', thickness: '40mm', finish: 'polish', ratePerSqft: 52 },
  { id: 'dr_knr_6', district: 'Kannur', size: '3x3', thickness: '50mm', finish: 'rough', ratePerSqft: 49 },

  // Thrissur
  { id: 'dr_tsr_1', district: 'Thrissur', size: '2x2', thickness: '30mm', finish: 'rough', ratePerSqft: 39 },
  { id: 'dr_tsr_2', district: 'Thrissur', size: '2x2', thickness: '40mm', finish: 'polish', ratePerSqft: 43 },
  { id: 'dr_tsr_3', district: 'Thrissur', size: '2x2', thickness: '50mm', finish: 'polish', ratePerSqft: 42 },
  { id: 'dr_tsr_4', district: 'Thrissur', size: '3x3', thickness: '30mm', finish: 'rough', ratePerSqft: 41 },
  { id: 'dr_tsr_5', district: 'Thrissur', size: '3x3', thickness: '40mm', finish: 'polish', ratePerSqft: 46 },
  { id: 'dr_tsr_6', district: 'Thrissur', size: '3x3', thickness: '50mm', finish: 'rough', ratePerSqft: 43 },

  // Ernakulam
  { id: 'dr_ekm_1', district: 'Ernakulam', size: '2x2', thickness: '30mm', finish: 'rough', ratePerSqft: 41 },
  { id: 'dr_ekm_2', district: 'Ernakulam', size: '2x2', thickness: '40mm', finish: 'polish', ratePerSqft: 45 },
  { id: 'dr_ekm_3', district: 'Ernakulam', size: '2x2', thickness: '50mm', finish: 'polish', ratePerSqft: 46 },
  { id: 'dr_ekm_4', district: 'Ernakulam', size: '3x3', thickness: '30mm', finish: 'rough', ratePerSqft: 43 },
  { id: 'dr_ekm_5', district: 'Ernakulam', size: '3x3', thickness: '40mm', finish: 'polish', ratePerSqft: 48 },
  { id: 'dr_ekm_6', district: 'Ernakulam', size: '3x3', thickness: '50mm', finish: 'rough', ratePerSqft: 45 }
];

const ensureDefaultDistrictRates = async () => {
  try {
    const count = await DistrictRate.countDocuments();
    if (count === 0) {
      console.log('[Database Seed] Seeding default district rates...');
      await DistrictRate.insertMany(defaultDistrictRates);
      console.log('[Database Seed] Default district rates seeded successfully.');
    } else {
      console.log('[Database Seed] District rates already populated.');
    }
  } catch (err) {
    console.error(`[Database Seed] Error seeding default district rates: ${err.message}`);
  }
};

const ensureMockDataSeeded = async () => {
  try {
    const count = await Order.countDocuments();
    if (count === 0) {
      console.log('[Database Seed] Seeding mock logistics data...');
      const seedFilePath = path.join(__dirname, 'seedData.json');
      if (fs.existsSync(seedFilePath)) {
        const data = JSON.parse(fs.readFileSync(seedFilePath, 'utf8'));
        
        // 1. Seed orders, trips, lorries, notifications
        await Promise.all([
          data.seedOrders && Order.insertMany(data.seedOrders),
          data.trips && Trip.insertMany(data.trips),
          data.lorries && Lorry.insertMany(data.lorries),
          data.seedNotifications && Notification.insertMany(data.seedNotifications)
        ].filter(Boolean));

        // 2. Seed drivers as Users with nested driverProfile
        if (data.drivers) {
          for (const d of data.drivers) {
            const email = `${d.name.toLowerCase().replace(/\s+/g, '')}@transia.com`;
            const existing = await User.findOne({ username: email });
            if (!existing) {
              const user = new User({
                username: email,
                password: 'password123',
                role: 'driver',
                name: d.name,
                phone: d.phone || '',
                driverProfile: {
                  id: d.id,
                  lorryId: d.lorryId || null,
                  status: d.status || 'idle',
                  joinedOn: d.joinedOn,
                  tripsCompleted: d.tripsCompleted || 0,
                  supervisorId: null
                }
              });
              await user.save();
            }
          }
        }

        // 3. Seed unloading parties (buyers) as Users with nested buyerProfile
        if (data.unloadingParties) {
          for (const up of data.unloadingParties) {
            const username = `buyer_${up.name.toLowerCase().replace(/\s+/g, '_')}`;
            const existing = await User.findOne({ username });
            if (!existing) {
              const user = new User({
                username,
                password: 'password123',
                role: 'buyer',
                name: up.name,
                phone: '',
                buyerProfile: {
                  id: up.id,
                  district: up.district,
                  totalOrdered: up.totalOrdered || 0,
                  paid: up.paid || 0,
                  pending: up.pending || 0,
                  supervisorId: null
                }
              });
              await user.save();
            }
          }
        }

        // 4. Seed loading parties (supervisors) as Users with nested loadingPartyProfile
        if (data.loadingParties) {
          for (const lp of data.loadingParties) {
            const username = `supervisor_${lp.name.toLowerCase().replace(/\s+/g, '_')}`;
            const existing = await User.findOne({ username });
            if (!existing) {
              const user = new User({
                username,
                password: 'password123',
                role: 'loading_supervisor',
                name: `${lp.name} Supervisor`,
                phone: '',
                loadingPartyProfile: {
                  id: lp.id,
                  name: lp.name,
                  location: lp.location,
                  totalPurchased: lp.totalPurchased || 0,
                  paid: lp.paid || 0,
                  pending: lp.pending || 0
                }
              });
              await user.save();
            }
          }
        }
        
        console.log('[Database Seed] Mock logistics data seeded successfully.');
      } else {
        console.warn('[Database Seed] seedData.json not found. Skipping mock data seeding.');
      }
    } else {
      console.log('[Database Seed] Mock logistics data already populated.');
    }
  } catch (err) {
    console.error(`[Database Seed] Error seeding mock data: ${err.message}`);
  }
};

const ensureDefaultUsers = async () => {
  try {
    // 1. Ensure Owner User
    const ownerEmail = 'subhash.cropnow@gmail.com';
    const existingOwner = await User.findOne({ username: ownerEmail });
    if (!existingOwner) {
      console.log(`[Database Seed] Creating default owner user: ${ownerEmail}`);
      const owner = new User({
        username: ownerEmail,
        password: '12345',
        role: 'owner',
        name: 'Subhash Owner'
      });
      await owner.save();
      console.log(`[Database Seed] Default owner user created successfully.`);
    } else {
      console.log(`[Database Seed] Default owner user already exists.`);
    }

  } catch (err) {
    console.error(`[Database Seed] Error ensuring default users: ${err.message}`);
  }
};

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MongoDB Connection Error: MONGODB_URI is not defined in environment variables.');
    return;
  }

  mongoose.connection.on('connected', async () => {
    console.log(`MongoDB Connected: ${mongoose.connection.host}`);
    // Run the default setups once connected
    await ensureDefaultUsers();
    await ensureDefaultStoneRates();
    await ensureDefaultDistrictRates();
    try {
      const { syncAllExistingUsersToEntityCollections } = await import('../services/entitySync.service.js');
      await syncAllExistingUsersToEntityCollections();
    } catch (err) {
      console.error('[Database Seed/Sync] Error syncing entity collections:', err.message);
    }
  });

  mongoose.connection.on('error', (err) => {
    console.error(`MongoDB Runtime Error: ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB Disconnected.');
  });

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000, // 10s timeout
    });
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    console.warn('Server will continue running. Check your MongoDB Atlas credentials or network connection.');
    console.warn('→ Tip: Your Atlas cluster may be paused. Resume it at https://cloud.mongodb.com');
  }
};

