import { Order } from '../models/Order.js';
import { Notification } from '../models/Notification.js';

export const getOrders = async (req, res, next) => {
  try {
    let filter = {};
    if (req.user && req.user.role === 'buyer') {
      filter.unloadingPartyId = req.user.buyerRef;
    } else if (req.user && req.user.role === 'driver') {
      return res.status(200).json([]);
    }
    const data = await Order.find(filter).sort({ createdAt: -1 });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const createOrder = async (req, res, next) => {
  try {
    const orderData = req.body;
    const newOrder = new Order(orderData);
    await newOrder.save();

    // Trigger Notification for new orders
    const notif = new Notification({
      id: `n-${Date.now()}`,
      kind: 'order',
      title: `New order · ${newOrder.code}`,
      body: `Order placed for district: ${newOrder.district}`,
      time: 'just now',
      read: false,
      orderId: newOrder.id
    });
    await notif.save();

    res.status(201).json(newOrder);
  } catch (err) {
    next(err);
  }
};

export const updateOrderStatus = async (req, res, next) => {
  try {
    const { status, amountPaid } = req.body;
    const updateObj = {};
    if (status !== undefined) updateObj.status = status;
    if (amountPaid !== undefined) updateObj.amountPaid = amountPaid;

    const order = await Order.findOneAndUpdate(
      { id: req.params.id },
      updateObj,
      { new: true }
    );
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
};
