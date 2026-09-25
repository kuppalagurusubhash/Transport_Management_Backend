import { Driver } from '../models/Driver.js';
import { LoadingParty } from '../models/LoadingParty.js';
import { UnloadingParty } from '../models/UnloadingParty.js';

export const syncUserToEntityCollection = async (user) => {
  if (!user) return;
  try {
    if (user.role === 'driver' && user.driverProfile) {
      await Driver.findOneAndUpdate(
        { $or: [{ id: user.driverProfile.id }, { userId: user._id }] },
        {
          id: user.driverProfile.id,
          userId: user._id,
          name: user.name,
          email: user.username,
          phone: user.phone || '',
          lorryId: user.driverProfile.lorryId || null,
          status: user.driverProfile.status || 'idle',
          joinedOn: user.driverProfile.joinedOn || new Date().toISOString().slice(0, 10),
          tripsCompleted: user.driverProfile.tripsCompleted || 0,
          supervisorId: user.driverProfile.supervisorId || null
        },
        { upsert: true, new: true }
      );
    } else if (user.role === 'buyer' && user.buyerProfile) {
      await UnloadingParty.findOneAndUpdate(
        { $or: [{ id: user.buyerProfile.id }, { userId: user._id }] },
        {
          id: user.buyerProfile.id,
          userId: user._id,
          name: user.name,
          email: user.username,
          phone: user.phone || '',
          district: user.buyerProfile.district || '',
          totalOrdered: user.buyerProfile.totalOrdered || 0,
          paid: user.buyerProfile.paid || 0,
          pending: user.buyerProfile.pending || 0,
          supervisorId: user.buyerProfile.supervisorId || null
        },
        { upsert: true, new: true }
      );
    } else if (user.role === 'loading_supervisor' && user.loadingPartyProfile) {
      await LoadingParty.findOneAndUpdate(
        { $or: [{ id: user.loadingPartyProfile.id }, { userId: user._id }] },
        {
          id: user.loadingPartyProfile.id,
          userId: user._id,
          name: user.loadingPartyProfile.name || user.name,
          email: user.username,
          phone: user.phone || '',
          location: user.loadingPartyProfile.location || '',
          totalPurchased: user.loadingPartyProfile.totalPurchased || 0,
          paid: user.loadingPartyProfile.paid || 0,
          pending: user.loadingPartyProfile.pending || 0,
          supervisorId: user._id
        },
        { upsert: true, new: true }
      );
    }
  } catch (err) {
    console.error('[Entity Sync Error]:', err.message);
  }
};

export const deleteUserFromEntityCollection = async (user) => {
  if (!user) return;
  try {
    if (user.role === 'driver') {
      const conditions = [{ userId: user._id }];
      if (user.driverProfile?.id) conditions.push({ id: user.driverProfile.id });
      await Driver.deleteMany({ $or: conditions });
    } else if (user.role === 'buyer') {
      const conditions = [{ userId: user._id }];
      if (user.buyerProfile?.id) conditions.push({ id: user.buyerProfile.id });
      await UnloadingParty.deleteMany({ $or: conditions });
    } else if (user.role === 'loading_supervisor') {
      const conditions = [{ userId: user._id }];
      if (user.loadingPartyProfile?.id) conditions.push({ id: user.loadingPartyProfile.id });
      await LoadingParty.deleteMany({ $or: conditions });
    }
  } catch (err) {
    console.error('[Entity Sync Delete Error]:', err.message);
  }
};

export const syncAllExistingUsersToEntityCollections = async () => {
  try {
    const { User } = await import('../models/User.js');
    const users = await User.find({ role: { $in: ['driver', 'buyer', 'loading_supervisor'] } });
    console.log(`[Entity Sync] Syncing ${users.length} user(s) to drivers, loadingparties, and unloadingparties...`);
    for (const u of users) {
      await syncUserToEntityCollection(u);
    }
    console.log('[Entity Sync] Synchronization complete.');
  } catch (err) {
    console.error('[Entity Sync All Error]:', err.message);
  }
};
