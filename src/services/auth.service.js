import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { User } from '../models/User.js';

dotenv.config({ override: true });

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'supersecretaccesskey';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'supersecretrefreshkey';

export const authService = {
  generateAccessToken(userId, role, buyerRef = null, driverRef = null) {
    return jwt.sign({ id: userId, role, buyerRef, driverRef, type: 'access' }, JWT_SECRET, { expiresIn: '1h' });
  },

  generateRefreshToken(userId, role, buyerRef = null, driverRef = null) {
    return jwt.sign({ id: userId, role, buyerRef, driverRef, type: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  },

  verifyAccessToken(token) {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'access') throw new Error('Invalid token type');
    return decoded;
  },

  verifyRefreshToken(token) {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    if (decoded.type !== 'refresh') throw new Error('Invalid token type');
    return decoded;
  },

  async register(data) {
    if (data.role === 'owner') {
      throw new Error('Registration as owner is not allowed.');
    }
    const existing = await User.findOne({ username: data.username });
    if (existing) throw new Error('Username already taken');

    let driverProfile = null;
    let buyerProfile = null;
    let loadingPartyProfile = null;

    if (data.role === 'driver') {
      let driverId = data.driverRef || `d-${Date.now()}`;
      let lorryId = null;
      let status = 'idle';
      let joinedOn = new Date().toISOString().slice(0, 10);
      let tripsCompleted = 0;
      let supervisorId = null;

      if (data.driverRef) {
        const existingDriverUser = await User.findOne({ "driverProfile.id": data.driverRef });
        if (existingDriverUser && existingDriverUser.driverProfile) {
          lorryId = existingDriverUser.driverProfile.lorryId;
          status = existingDriverUser.driverProfile.status;
          joinedOn = existingDriverUser.driverProfile.joinedOn;
          tripsCompleted = existingDriverUser.driverProfile.tripsCompleted;
          supervisorId = existingDriverUser.driverProfile.supervisorId;

          existingDriverUser.username = data.username;
          existingDriverUser.password = data.password;
          existingDriverUser.name = data.name || existingDriverUser.name;
          existingDriverUser.phone = data.phone || existingDriverUser.phone;
          await existingDriverUser.save();

          const accessToken = this.generateAccessToken(existingDriverUser._id, existingDriverUser.role, existingDriverUser.buyerRef, existingDriverUser.driverRef);
          const refreshToken = this.generateRefreshToken(existingDriverUser._id, existingDriverUser.role, existingDriverUser.buyerRef, existingDriverUser.driverRef);
          const userObj = existingDriverUser.toObject();
          delete userObj.password;
          return {
            user: userObj,
            accessToken,
            refreshToken
          };
        }
      }

      driverProfile = {
        id: driverId,
        lorryId,
        status,
        joinedOn,
        tripsCompleted,
        supervisorId
      };
    }

    if (data.role === 'buyer') {
      let buyerId = (data.buyerInfo && data.buyerInfo.id) || data.buyerRef || `up-${Date.now()}`;
      let district = (data.buyerInfo && data.buyerInfo.district) || 'Palakkad';
      let name = (data.buyerInfo && data.buyerInfo.name) || data.name;
      let totalOrdered = 0;
      let paid = 0;
      let pending = 0;
      let supervisorId = null;

      const existingBuyerUser = await User.findOne({ "buyerProfile.id": buyerId });
      if (existingBuyerUser && existingBuyerUser.buyerProfile) {
        district = existingBuyerUser.buyerProfile.district;
        totalOrdered = existingBuyerUser.buyerProfile.totalOrdered;
        paid = existingBuyerUser.buyerProfile.paid;
        pending = existingBuyerUser.buyerProfile.pending;
        supervisorId = existingBuyerUser.buyerProfile.supervisorId;

        existingBuyerUser.username = data.username;
        existingBuyerUser.password = data.password;
        existingBuyerUser.name = data.name || existingBuyerUser.name;
        existingBuyerUser.phone = data.phone || existingBuyerUser.phone;
        await existingBuyerUser.save();

        const accessToken = this.generateAccessToken(existingBuyerUser._id, existingBuyerUser.role, existingBuyerUser.buyerRef, existingBuyerUser.driverRef);
        const refreshToken = this.generateRefreshToken(existingBuyerUser._id, existingBuyerUser.role, existingBuyerUser.buyerRef, existingBuyerUser.driverRef);
        const userObj = existingBuyerUser.toObject();
        delete userObj.password;
        return {
          user: userObj,
          accessToken,
          refreshToken
        };
      }

      buyerProfile = {
        id: buyerId,
        district,
        totalOrdered,
        paid,
        pending,
        supervisorId
      };
    }

    if (data.role === 'loading_supervisor') {
      if (!data.location || !data.location.trim().toLowerCase().startsWith('ramapuram')) {
        throw new Error('Loading Supervisor must be from Ramapuram only');
      }
      let supervisorId = data.buyerInfo?.id || data.buyerRef || `lp-${Date.now()}`;
      let location = data.location.trim();
      let name = data.name;
      let totalPurchased = 0;
      let paid = 0;
      let pending = 0;

      loadingPartyProfile = {
        id: supervisorId,
        name: name || data.username,
        location,
        totalPurchased,
        paid,
        pending
      };
    }

    const userData = {
      username: data.username,
      password: data.password,
      role: data.role,
      name: data.name,
      phone: data.phone || '',
      driverProfile,
      buyerProfile,
      loadingPartyProfile
    };

    const user = new User(userData);
    await user.save();

    const accessToken = this.generateAccessToken(user._id, user.role, user.buyerRef, user.driverRef);
    const refreshToken = this.generateRefreshToken(user._id, user.role, user.buyerRef, user.driverRef);
    const userObj = user.toObject();
    delete userObj.password;
    return {
      user: userObj,
      accessToken,
      refreshToken
    };
  },

  async login(username, password) {
    const user = await User.findOne({ username });
    if (!user) throw new Error('Invalid credentials');
    const match = await user.comparePassword(password);
    if (!match) throw new Error('Invalid credentials');
    const accessToken = this.generateAccessToken(user._id, user.role, user.buyerRef, user.driverRef);
    const refreshToken = this.generateRefreshToken(user._id, user.role, user.buyerRef, user.driverRef);
    const userObj = user.toObject();
    delete userObj.password;
    return {
      user: userObj,
      accessToken,
      refreshToken
    };
  },

  async refresh(token) {
    const decoded = this.verifyRefreshToken(token);
    const user = await User.findById(decoded.id);
    if (!user) throw new Error('User not found');
    const accessToken = this.generateAccessToken(user._id, user.role, user.buyerRef, user.driverRef);
    const refreshToken = this.generateRefreshToken(user._id, user.role, user.buyerRef, user.driverRef);
    return { accessToken, refreshToken };
  },

  async updateProfile(userId, { name, phone }) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;

    await user.save();
    const userObj = user.toObject();
    delete userObj.password;
    return userObj;
  },

  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const match = await user.comparePassword(currentPassword);
    if (!match) throw new Error('Incorrect current password');

    user.password = newPassword;
    await user.save();
    return { success: true };
  }
};
