import mongoose from 'mongoose';
import dns from 'dns/promises';
import dotenv from 'dotenv';
import { User } from './src/models/User.js';

dotenv.config();

// Use ipv4first to help with Atlas SRV DNS resolution
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore if not supported
}

const OWNER_EMAIL = 'subhash.cropnow@gmail.com';
const OWNER_PASSWORD = '12345';

async function clearDatabase() {
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
      console.error('Or check if your MONGODB_URI in .env has the correct cluster connection string.\n');
    }
    process.exit(1);
  }

  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collections:`, collections.map(c => c.name));

    // Clear all other collections
    for (const col of collections) {
      if (col.name === 'users') continue;
      const count = await db.collection(col.name).countDocuments();
      console.log(`Clearing collection '${col.name}' (${count} documents)...`);
      await db.collection(col.name).deleteMany({});
    }

    // Clear users collection
    console.log(`Clearing users collection...`);
    await User.deleteMany({});

    // Create single owner user
    console.log(`Creating owner user: ${OWNER_EMAIL}...`);
    const owner = new User({
      username: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      role: 'owner',
      name: 'Subhash'
    });
    await owner.save();

    console.log('✓ Successfully created owner user.');

    // Summary verification
    console.log('\n--- Final Database State ---');
    const remainingCollections = await db.listCollections().toArray();
    for (const col of remainingCollections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`Collection [${col.name}]: ${count} document(s)`);
    }

    const createdUser = await User.findOne({ username: OWNER_EMAIL }).select('-password');
    console.log('\nRemaining user in database:');
    console.log(JSON.stringify(createdUser, null, 2));

    const checkUser = await User.findOne({ username: OWNER_EMAIL });
    const isPasswordValid = await checkUser.comparePassword(OWNER_PASSWORD);
    console.log(`\nPassword verification for '${OWNER_PASSWORD}': ${isPasswordValid ? 'PASSED' : 'FAILED'}`);

    console.log('\n✓ Database cleanup completed successfully! Only owner account exists.');
  } catch (err) {
    console.error(`Error during cleanup: ${err.message}`);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

clearDatabase();
