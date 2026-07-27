import { Order } from '../models/Order.js';
import { Notification } from '../models/Notification.js';
import { broadcastEvent } from '../sockets/socket.instance.js';

export const orderService = {
  async getAll() {
    return await Order.find({}).sort({ createdAt: -1 });
  },

  async getById(id) {
    return await Order.findOne({ id });
  },

  async create(data) {
    const newOrder = new Order(data);
    await newOrder.save();

    // Create notification
    const notif = new Notification({
      id: `n-${Date.now()}`,
      kind: 'order',
      title: `New Order · ${newOrder.code}`,
      body: `Order placed for district: ${newOrder.district}`,
      time: new Date().toISOString(),
      read: false,
      orderId: newOrder.id
    });
    await notif.save();

    // Broadcast to all connected clients
    broadcastEvent('order:created', { order: newOrder, notification: notif });

    return newOrder;
  },

  async updateStatus(id, status) {
    const order = await Order.findOneAndUpdate(
      { id },
      { status },
      { new: true }
    );

    // Broadcast status update
    broadcastEvent('order:status', { orderId: id, status });

    return order;
  }
};
