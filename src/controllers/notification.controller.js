import { Notification } from '../models/Notification.js';

export const getNotifications = async (req, res, next) => {
  try {
    const data = await Notification.find({}).sort({ createdAt: -1 });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const readAllNotifications = async (req, res, next) => {
  try {
    await Notification.updateMany({}, { read: true });
    res.status(200).json({ message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
};
