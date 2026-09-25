import mongoose from 'mongoose';
import dns from 'dns/promises';
import dotenv from 'dotenv';
import { User } from './src/models/User.js';
import { StoneRate } from './src/models/StoneRate.js';
import { DistrictRate } from './src/models/DistrictRate.js';

dotenv.config();

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore if not supported
}

const OWNER_EMAIL = 'subhash.cropnow@gmail.com';
const OWNER_PASSWORD = '12345';

export const defaultStoneRates = [
  { id: 'sp1', size: '2x2', thickness: '30mm', finish: 'rough', ratePerSqft: 17 },
  { id: 'sp2', size: '2x2', thickness: '40mm', finish: 'polish', ratePerSqft: 19 },
  { id: 'sp3', size: '2x2', thickness: '50mm', finish: 'polish', ratePerSqft: 20 },
  { id: 'sp4', size: '3x3', thickness: '30mm', finish: 'rough', ratePerSqft: 18 },
  { id: 'sp5', size: '3x3', thickness: '40mm', finish: 'polish', ratePerSqft: 20 },
  { id: 'sp6', size: '3x3', thickness: '50mm', finish: 'rough', ratePerSqft: 18 }
];

export const defaultDistrictRates = [
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

async function clearAndSetupDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MONGODB_URI is not set in .env');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log(`Connected to database: ${mongoose.connection.name}`);
  } catch (err) {
    console.error(`\nFailed to connect to MongoDB: ${err.message}`);
    if (err.message.includes('ENOTFOUND') || err.message.includes('querySrv')) {
      console.error('\nNOTE: If your MongoDB Atlas cluster is paused, please resume it at https://cloud.mongodb.com');
      console.error('Or if you are running MongoDB locally, set MONGODB_URI=mongodb://127.0.0.1:27017/transport_management in .env\n');
    }
    process.exit(1);
  }

  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collections:`, collections.map(c => c.name));

    // 1. Wipe all other collections (orders, trips, lorries, notifications, etc.)
    const preservedCollections = ['users', 'stonerates', 'districtrates'];
    for (const col of collections) {
      if (!preservedCollections.includes(col.name.toLowerCase())) {
        const count = await db.collection(col.name).countDocuments();
        console.log(`Clearing collection '${col.name}' (${count} documents)...`);
        await db.collection(col.name).deleteMany({});
      }
    }

    // 2. Clear users collection and insert ONLY owner
    console.log(`Clearing users collection...`);
    await User.deleteMany({});
    console.log(`Creating owner user: ${OWNER_EMAIL}...`);
    const owner = new User({
      username: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      role: 'owner',
      name: 'Subhash'
    });
    await owner.save();
    console.log('✓ Successfully created owner user.');

    // 3. Populate Stone Rates
    console.log(`Setting up stone purchase rates...`);
    await StoneRate.deleteMany({});
    await StoneRate.insertMany(defaultStoneRates);
    console.log(`✓ Successfully seeded ${defaultStoneRates.length} stone rates.`);

    // 4. Populate District Rates
    console.log(`Setting up district selling rates...`);
    await DistrictRate.deleteMany({});
    await DistrictRate.insertMany(defaultDistrictRates);
    console.log(`✓ Successfully seeded ${defaultDistrictRates.length} district rates.`);

    // 5. Final summary
    console.log('\n================ FINAL DATABASE STATUS ================');
    const updatedCollections = await db.listCollections().toArray();
    for (const col of updatedCollections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`Collection [${col.name}]: ${count} document(s)`);
    }

    const checkUser = await User.findOne({ username: OWNER_EMAIL });
    const isPasswordValid = await checkUser.comparePassword(OWNER_PASSWORD);
    console.log(`Owner Account: ${checkUser.username} | Role: ${checkUser.role} | Password Check: ${isPasswordValid ? 'PASSED' : 'FAILED'}`);
    console.log('======================================================');
    console.log('✓ Database setup completed! Only Owner, Stone Rates, and District Rates are present.');
  } catch (err) {
    console.error(`Error during database setup: ${err.message}`);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

clearAndSetupDatabase();
