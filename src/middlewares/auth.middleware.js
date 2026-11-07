import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || (process.env.NODE_ENV !== 'production' ? 'supersecretaccesskey' : null);

export const authenticate = async (req, res, next) => {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ success: false, message: 'Server authentication configuration missing (JWT_ACCESS_SECRET)' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication token required (Bearer <token>)' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'access') {
      return res.status(401).json({ success: false, message: 'Invalid token type: Access token expected' });
    }

    let user = null;
    try {
      user = await User.findById(decoded.id).maxTimeMS(2000);
    } catch (e) {}

    if (!user) {
      if (process.env.NODE_ENV !== 'production') {
        user = {
          _id: decoded.id,
          id: decoded.id,
          username: decoded.role === 'owner' ? (process.env.DEFAULT_OWNER_EMAIL || 'owner@transia.com') : decoded.role,
          name: decoded.role === 'owner' ? (process.env.DEFAULT_OWNER_NAME || 'Owner') : (decoded.role === 'driver' ? 'Driver' : 'Supervisor'),
          role: decoded.role,
          buyerRef: decoded.buyerRef,
          driverRef: decoded.driverRef
        };
      } else {
        return res.status(401).json({ success: false, message: 'User account not found or deactivated' });
      }
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired authentication token' });
  }
};

export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied: requires one of the roles: [${roles.join(', ')}]. Current role: ${req.user.role}`
      });
    }

    next();
  };
};

export const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.type === 'access') {
        const user = await User.findById(decoded.id);
        if (user) {
          req.user = user;
        }
      }
    }
    next();
  } catch (err) {
    next();
  }
};
