import { Order } from '../models/Order.js';
import { Notification } from '../models/Notification.js';
import { notifyOwnerOfNewOrder } from '../services/orderNotification.service.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { buyerLedgerService } from '../services/buyerLedger.service.js';

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

    // Trigger in-app WebSocket notification & WhatsApp Alert to Owner before assigning lorry
    notifyOwnerOfNewOrder(newOrder).catch(err => {
      console.error('[Order Controller] notifyOwnerOfNewOrder error:', err.message);
    });

    // Update buyer's financial ledger immediately
    if (newOrder.unloadingPartyId) {
      buyerLedgerService.calculateBuyerLedger(newOrder.unloadingPartyId).catch(err => {
        console.warn('[Order Controller] Ledger sync error on order creation:', err.message);
      });
    }

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

    if (order) {
      // Keep buyer financial ledger updated
      if (order.unloadingPartyId) {
        buyerLedgerService.calculateBuyerLedger(order.unloadingPartyId).catch(err => {
          console.warn('[Order Controller] Ledger sync error on order update:', err.message);
        });
      }

      // If order was dispatched or confirmed, notify buyer if vehicle & driver are assigned
      if (status === 'dispatched' || status === 'confirmed') {
        const { Trip } = await import('../models/Trip.js');
        const trip = await Trip.findOne({ 
          $or: [
            { orderId: order.id },
            { orderIds: order.id },
            { 'stops.orderId': order.id },
            { unloadingPartyId: order.unloadingPartyId }
          ] 
        }).sort({ createdAt: -1 });

        if (trip && (trip.driverId || trip.lorryId)) {
          whatsappService.sendBuyerTripNotification(trip).catch(err => {
            console.error('[Order Controller] WhatsApp buyer notification error:', err.message);
          });
        }
      }
    }

    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
};

