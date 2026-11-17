import mongoose from 'mongoose';
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
    const { status, amountPaid, driverId, lorryPlate, tripId } = req.body;
    const updateObj = {};
    if (status !== undefined) updateObj.status = status;
    if (amountPaid !== undefined) updateObj.amountPaid = amountPaid;
    if (driverId !== undefined) updateObj.driverId = driverId;
    if (lorryPlate !== undefined) updateObj.lorryPlate = lorryPlate;
    if (tripId !== undefined) updateObj.tripId = tripId;

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

      // Check if order was dispatched, in-transit, confirmed, or assigned to driver
      const isDispatchedOrAssigned = 
        status === 'dispatched' || 
        status === 'in-transit' || 
        status === 'confirmed' || 
        Boolean(driverId);

      if (isDispatchedOrAssigned) {
        const { Trip } = await import('../models/Trip.js');
        const trip = await Trip.findOne({ 
          $or: [
            { id: order.tripId },
            { orderId: order.id },
            { orderIds: order.id },
            { 'stops.orderId': order.id },
            { unloadingPartyId: order.unloadingPartyId }
          ].filter(Boolean)
        }).sort({ createdAt: -1 });

        // 1. Notify Kerala Party (Buyer)
        if (trip && (trip.driverId || trip.lorryId)) {
          whatsappService.sendBuyerTripNotification(trip).catch(err => {
            console.error('[Order Controller] WhatsApp Kerala party notification error:', err.message);
          });
        } else {
          whatsappService.sendBuyerOrderNotification(order).catch(err => {
            console.error('[Order Controller] Standalone WhatsApp Kerala party notification error:', err.message);
          });
        }

        // 2. Notify Driver when order is dispatched or assigned to driver
        if (trip && trip.driverId) {
          whatsappService.sendDriverTripNotification(trip).catch(err => {
            console.error('[Order Controller] WhatsApp driver notification error:', err.message);
          });
        } else if (order.driverId) {
          whatsappService.sendDriverOrderNotification(order).catch(err => {
            console.error('[Order Controller] Standalone WhatsApp driver notification error:', err.message);
          });
        }
      }
    }

    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
};

/**
 * Manually trigger WhatsApp notification for an order to Kerala party and/or driver
 */
export const notifyOrderPartiesWhatsApp = async (req, res, next) => {
  try {
    const order = await Order.findOne({ id: req.params.id });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const { Trip } = await import('../models/Trip.js');
    const trip = await Trip.findOne({ 
      $or: [
        { id: order.tripId },
        { orderId: order.id },
        { orderIds: order.id },
        { 'stops.orderId': order.id },
        { unloadingPartyId: order.unloadingPartyId }
      ].filter(Boolean)
    }).sort({ createdAt: -1 });

    let buyerResult = null;
    if (trip && (trip.driverId || trip.lorryId)) {
      buyerResult = await whatsappService.sendBuyerTripNotification(trip);
    } else {
      buyerResult = await whatsappService.sendBuyerOrderNotification(order);
    }

    let driverResult = null;
    if (trip && trip.driverId) {
      driverResult = await whatsappService.sendDriverTripNotification(trip);
    } else if (order.driverId) {
      driverResult = await whatsappService.sendDriverOrderNotification(order);
    }

    res.status(200).json({
      success: true,
      message: 'WhatsApp notifications dispatched for order',
      buyerResult,
      driverResult
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete a created order by id (or Mongo _id).
 * Owners can delete any order; buyers can only delete their own un-dispatched orders.
 */
export const deleteOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const query = mongoose.isValidObjectId(id)
      ? { $or: [{ id }, { _id: id }] }
      : { id };

    const order = await Order.findOne(query);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (req.user?.role === 'buyer') {
      if (order.unloadingPartyId !== req.user.buyerRef) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You can only delete your own orders.'
        });
      }

      if (order.tripId || !['draft', 'placed', 'cancelled'].includes(order.status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete order with status '${order.status}'. Only draft, placed, or cancelled orders can be deleted.`
        });
      }
    }

    await Order.deleteOne({ _id: order._id });

    // Detach from any trips referencing this order
    try {
      const Trip = mongoose.models.Trip || mongoose.model('Trip');
      if (Trip) {
        await Trip.updateMany(
          { $or: [{ orderId: order.id }, { orderIds: order.id }] },
          { 
            $pull: { orderIds: order.id, dropStops: { orderId: order.id } },
            $unset: { ...(order.id ? { orderId: 1 } : {}) }
          }
        );
      }
    } catch (tripErr) {
      console.warn('[Order Controller] Trip detach notice on order deletion:', tripErr.message);
    }

    if (order.unloadingPartyId) {
      buyerLedgerService.calculateBuyerLedger(order.unloadingPartyId).catch(err => {
        console.warn('[Order Controller] Ledger sync error on order deletion:', err.message);
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order deleted successfully',
      data: order
    });
  } catch (err) {
    next(err);
  }
};

