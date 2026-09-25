import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { UnloadingParty } from '../models/UnloadingParty.js';
import { broadcastEvent } from '../sockets/socket.instance.js';
import { whatsappService, normalizePhoneNumber } from './whatsapp.service.js';

/**
 * Notifies the Owner & Admin both in real-time (UI WebSocket) and via WhatsApp
 * before any lorry or driver is assigned to the order.
 */
export const notifyOwnerOfNewOrder = async (order, buyerInfo = null) => {
  try {
    // 1. Resolve Buyer details
    let buyer = buyerInfo;
    if (!buyer && order.unloadingPartyId) {
      buyer = await UnloadingParty.findOne({ id: order.unloadingPartyId });
      if (!buyer) {
        buyer = await User.findOne({
          role: 'buyer',
          $or: [
            { 'buyerProfile.id': order.unloadingPartyId },
            { username: order.unloadingPartyId }
          ]
        });
      }
    }

    const buyerName = buyer?.name || order.unloadingPartyId || 'Customer';
    const buyerPhone = buyer?.phone || 'N/A';
    const district = order.district || buyer?.district || 'Palakkad';

    // Format Stone Lines
    let itemsSummary = 'No stone lines specified';
    let totalPieces = 0;
    let totalSqft = 0;
    let totalEstimatedAmount = 0;

    if (Array.isArray(order.lines) && order.lines.length > 0) {
      const parts = order.lines.map((line, idx) => {
        const size = line.size || '2x2';
        const thickness = line.thickness || '30mm';
        const finish = line.finish ? (line.finish.charAt(0).toUpperCase() + line.finish.slice(1)) : 'Rough';
        const pieces = Number(line.pieces) || 0;
        const sqftPerPiece = Number(line.sqftPerPiece) || (size === '3x3' ? 9 : 4);
        const lineSqft = pieces * sqftPerPiece;
        const rate = Number(line.ratePerSqft) || 40;
        const lineAmount = lineSqft * rate;

        totalPieces += pieces;
        totalSqft += lineSqft;
        totalEstimatedAmount += lineAmount;

        return `  ${idx + 1}. *${size}* (${thickness} ${finish}): ${pieces} pcs (${lineSqft} sq.ft)`;
      });
      itemsSummary = parts.join('\n');
    }

    // 2. Save in-app Notification in MongoDB
    const notif = new Notification({
      id: `n-${Date.now()}`,
      kind: 'order',
      title: `🔔 New Order: ${order.code}`,
      body: `${buyerName} (${district}) placed an order for ${totalPieces} pcs. Needs lorry assignment!`,
      time: 'just now',
      read: false,
      orderId: order.id
    });
    await notif.save();

    // 3. Broadcast real-time Socket.IO events to all open frontend dashboards
    broadcastEvent('order:created', order);
    broadcastEvent('notification:new', notif);
    console.log(`[Order Notification] Real-time socket event broadcasted for order ${order.code}`);

    // 4. Determine Owner Phone for WhatsApp Alert
    const ownerPhone = process.env.OWNER_ALERT_PHONE || process.env.OWNER_PHONE || '7893310812';
    const normalizedOwnerPhone = normalizePhoneNumber(ownerPhone);

    if (normalizedOwnerPhone) {
      const alertMessage = (
`🔔 *NEW STONE ORDER RECEIVED — ACTION REQUIRED!*

An order has been placed by a buyer and is waiting for lorry assignment:

📋 *Order Code:* ${order.code}
👤 *Buyer:* *${buyerName}* (${district})
📞 *Buyer Mobile:* ${buyerPhone}
📅 *Date Placed:* ${order.placedAt || new Date().toISOString().slice(0, 10)}

📦 *Stone Consignment Details:*
${itemsSummary}
📊 *Total Pieces:* ${totalPieces} pcs | ${totalSqft} sq.ft
💰 *Estimated Value:* ₹${totalEstimatedAmount.toLocaleString('en-IN')}

⚠️ *STATUS:* ⏳ *Unassigned (Pending Lorry Assignment)*
👉 *Action Required:* Please open the application to assign an available lorry and driver to dispatch this consignment!

_Transia Logistics Alert System_`
      );

      console.log(`[Order Notification] Sending WhatsApp order alert to Owner (${normalizedOwnerPhone})...`);
      await whatsappService.sendDirectMessage(normalizedOwnerPhone, alertMessage);
    }
  } catch (err) {
    console.error('[Order Notification Error]:', err.message);
  }
};
