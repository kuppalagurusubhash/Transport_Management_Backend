import { dashboardService } from '../services/dashboard.service.js';

export const getOwnerDashboard = async (req, res, next) => {
  try {
    const stats = await dashboardService.getOwnerStats();
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
};

export const getLoadingDashboard = async (req, res, next) => {
  try {
    const supervisorId = req.user && req.user.role === 'loading_supervisor' ? req.user._id : null;
    const stats = await dashboardService.getLoadingStats(supervisorId);
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
};

export const getBuyerDashboard = async (req, res, next) => {
  try {
    let buyerId = null;

    if (req.user && req.user.role === 'buyer') {
      buyerId = req.user.buyerRef;
    } else if (req.user && req.user.role === 'owner') {
      buyerId = req.query.buyerId || req.body.buyerId;
    }

    if (!buyerId) {
      return res.status(400).json({ success: false, message: 'buyerId reference is required (must login as buyer or provide buyerId parameter as owner)' });
    }

    const stats = await dashboardService.getBuyerStats(buyerId);
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
