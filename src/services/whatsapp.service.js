import { User } from '../models/User.js';
import { Trip } from '../models/Trip.js';
import { Lorry } from '../models/Lorry.js';
import { Order } from '../models/Order.js';
import { UnloadingParty } from '../models/UnloadingParty.js';
import { Driver } from '../models/Driver.js';
import { pdfService } from './pdf.service.js';
import mongoose from 'mongoose';

/**
 * Normalizes phone number to E.164 format.
 * Defaults to country code specified in env (default: +91 for India).
 */
export const normalizePhoneNumber = (phone, defaultCountryCode = process.env.DEFAULT_COUNTRY_CODE || '+91') => {
  if (!phone) return null;
  let cleaned = String(phone).replace(/[^0-9+]/g, '');
  if (!cleaned) return null;

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // If starts with 0 (common trunk prefix in India), remove it
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  // If 10 digits, prepend default country code
  if (cleaned.length === 10) {
    const code = defaultCountryCode.startsWith('+') ? defaultCountryCode : `+${defaultCountryCode}`;
    return `${code}${cleaned}`;
  }

  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
};

/**
 * Formats a comprehensive WhatsApp message containing trip, lorry, origin, destination, and stone breakdown.
 * Intelligently formats multi-drop routes with clear stop sequence, per-stop unloading lists, and cash collections.
 */
export const formatTripWhatsAppMessage = (trip, driver, buyer, lorry, order) => {
  const driverName = driver?.name || 'Driver';
  const driverPhone = driver?.phone || 'N/A';
  const tripCode = trip.code || trip.id || 'N/A';
  const lorryPlate = lorry?.plate || trip.lorryId || 'Assigned Lorry';
  const origin = trip.origin || 'Quarry Loading Point';
  const date = trip.date || new Date().toISOString().slice(0, 10);

  const isMultiDrop = Array.isArray(trip.stops) && trip.stops.length > 1;

  if (isMultiDrop) {
    let grandPieces = 0;
    let grandSqft = 0;
    let grandExpected = 0;

    const stopBlocks = trip.stops.map((stop, idx) => {
      const stopNo = stop.stopNumber || (idx + 1);
      const customerName = stop.buyerName || stop.unloadingPartyId || `Customer ${stopNo}`;
      const location = stop.deliveryLocation || stop.district || 'Unloading Site';
      const contact = stop.buyerPhone ? `\n   📞 Mobile: *${stop.buyerPhone}*` : '';
      const expAmt = Number(stop.expectedAmount) || 0;
      grandExpected += expAmt;

      let stopLinesText = '   - Consignment verified';
      let stopPcs = 0;
      let stopSqft = 0;

      if (Array.isArray(stop.stoneLines) && stop.stoneLines.length > 0) {
        stopLinesText = stop.stoneLines.map((l, lIdx) => {
          const size = l.size || '2x2';
          const thickness = l.thickness || '';
          const finish = l.finish ? (l.finish.charAt(0).toUpperCase() + l.finish.slice(1)) : '';
          const pcs = Number(l.pieces) || 0;
          const sqftPerPcs = Number(l.sqftPerPiece) || (size === '3x3' ? 9 : 4);
          const lineSqft = pcs * sqftPerPcs;
          stopPcs += pcs;
          stopSqft += lineSqft;
          const desc = [size, thickness, finish].filter(Boolean).join(' | ');
          return `   ${lIdx + 1}. *${desc}* — *${pcs} pcs* ${lineSqft > 0 ? `(${lineSqft.toFixed(1)} sq.ft)` : ''}`;
        }).join('\n');
      } else if (stop.totalPieces > 0) {
        stopPcs = stop.totalPieces;
        stopSqft = stop.totalSqft || 0;
        stopLinesText = `   - *${stop.stoneSummary || 'Stone load'}* (${stop.totalPieces} pcs)`;
      }

      grandPieces += stopPcs;
      grandSqft += stopSqft;

      const collectText = expAmt > 0 ? `\n   💵 *Cash/UPI to Collect:* ₹${expAmt.toLocaleString('en-IN')}` : '';

      return (
`🛑 *STOP #${stopNo} of ${trip.stops.length}: ${customerName}*
   📍 Location: ${location}${contact}
   📦 *Items to Unload at Stop #${stopNo}:*
${stopLinesText}
   📊 Subtotal: *${stopPcs} pcs* ${stopSqft > 0 ? `(${stopSqft.toFixed(1)} sq.ft)` : ''}${collectText}`
      );
    }).join('\n\n');

    return (
`🚚 *TRANSIA TRANSPORT — MULTI-DROP ROUTE DISPATCH*

Hello *${driverName}*, a multi-drop route with *${trip.stops.length} unloading destinations* has been assigned to you.

📋 *Trip Code:* ${tripCode}
📅 *Date:* ${date}
🚛 *Assigned Vehicle:* *${lorryPlate}*
👨‍✈️ *Driver:* *${driverName}* (${driverPhone})
📍 *Loading Point (Origin):* ${origin}

━━━━━━━━━━━━━━━━━━━━━
🗺️ *UNLOADING SEQUENCE & STOP BREAKDOWN:*
━━━━━━━━━━━━━━━━━━━━━

${stopBlocks}

━━━━━━━━━━━━━━━━━━━━━
📊 *TOTAL LORRY CONSIGNMENT:*
• Total Stops: *${trip.stops.length}*
• Total Stone Pieces: *${grandPieces} pcs*
• Total Coverage: *${grandSqft > 0 ? grandSqft.toFixed(1) + ' sq.ft' : 'N/A'}*
${grandExpected > 0 ? `• Total Cash/UPI to Collect: *₹${grandExpected.toLocaleString('en-IN')}*\n` : ''}
⚠️ *MANDATORY DRIVER INSTRUCTIONS:*
1. *Loading Sequence:* Load Stop #${trip.stops.length} stones first at the bottom of the lorry; Stop #1 stones must be on top for immediate unloading.
2. *Unload Verification:* Strictly unload ONLY the specified pieces and sizes for each customer. DO NOT mix up stones between stops.
3. *Payment Collection:* Collect the designated cash/UPI payment at each stop and verify before driving to the next customer.
4. *Call Ahead:* Contact each customer 30 minutes before reaching their site.

📄 *Master Trip Manifest (PDF):*
👉 ${process.env.API_BASE_URL || 'http://localhost:9090'}/api/pdf/trip/${trip.id}/download

_Transia Stone Transport Logistics Management_`
    );
  }

  // Single-drop route formatting
  const buyerDistrict = buyer?.buyerProfile?.district || buyer?.district || '';
  const destination = buyer?.name 
    ? `${buyer.name}${buyerDistrict ? ` (${buyerDistrict})` : ''}`
    : (trip.unloadingPartyId || 'Customer Unloading Site');
  const buyerPhone = buyer?.phone || '';

  let stoneDetailsText = 'No stone details provided';
  let totalPieces = 0;
  let totalSqft = 0;

  const linesToUse = (Array.isArray(trip.stoneLines) && trip.stoneLines.length > 0)
    ? trip.stoneLines
    : (order && Array.isArray(order.lines) && order.lines.length > 0 ? order.lines : []);

  if (linesToUse.length > 0) {
    const lines = linesToUse.map((line, idx) => {
      const size = line.size || 'Standard';
      const thickness = line.thickness || '';
      const finish = line.finish ? (line.finish.charAt(0).toUpperCase() + line.finish.slice(1)) : '';
      const pieces = Number(line.pieces) || 0;
      const sqftPerPiece = Number(line.sqftPerPiece) || (size === '3x3' ? 9 : 4);
      const lineSqft = pieces * sqftPerPiece;

      totalPieces += pieces;
      totalSqft += lineSqft;

      const desc = [size, thickness, finish].filter(Boolean).join(' | ');
      return `  ${idx + 1}. *${desc}*\n     Quantity: ${pieces} pcs ${lineSqft > 0 ? `(${lineSqft.toFixed(1)} sq.ft)` : ''}`;
    });
    stoneDetailsText = lines.join('\n');
  }

  const summary = totalPieces > 0 
    ? `\n📊 *Total Load:* ${totalPieces} pcs ${totalSqft > 0 ? `| ${totalSqft.toFixed(1)} sq.ft` : ''}`
    : '';

  return (
`🚚 *TRANSIA TRANSPORT - TRIP DISPATCH ASSIGNMENT*

Hello *${driverName}*, a new delivery trip has been assigned to you.

📋 *Trip Code:* ${tripCode}
📅 *Date:* ${date}

👨‍✈️ *Driver Details:*
• Name: *${driverName}*
• Mobile: *${driverPhone}*

🚛 *Vehicle Details:*
• Lorry Plate: *${lorryPlate}*

📍 *Pickup / Loading:* ${origin}
🏁 *Delivery / Destination:* ${destination}
${buyerPhone ? `📞 *Customer Contact:* ${buyerPhone}\n` : ''}
📦 *Stone Consignment Details:*
${stoneDetailsText}${summary}

⚠️ *Driver Instructions:*
- Please inspect stone count & quality before loading.
- Confirm pickup with the loading supervisor upon arrival.
- Drive safely!

📄 *Master Trip Manifest (PDF):*
👉 ${process.env.API_BASE_URL || 'http://localhost:9090'}/api/pdf/trip/${trip.id}/download

_Automated update from Transia Logistics Management_`
  );
};

/**
 * Formats a comprehensive WhatsApp message to the Buyer when driver & vehicle are assigned.
 * Optionally supports specific stop in multi-drop trips.
 */
export const formatBuyerTripWhatsAppMessage = (trip, driver, buyer, lorry, order, stop = null) => {
  const buyerName = stop?.buyerName || buyer?.name || 'Valued Customer';
  const driverName = driver?.name || 'Assigned Driver';
  const driverPhone = driver?.phone || 'Driver will contact upon arrival';
  const tripCode = trip?.code || trip?.id || (order?.code || 'N/A');
  const lorryPlate = lorry?.plate || trip?.lorryId || 'Assigned Lorry';
  const buyerDistrict = stop?.district || buyer?.buyerProfile?.district || buyer?.district || (order?.district || '');
  const destination = stop?.deliveryLocation 
    ? stop.deliveryLocation 
    : (buyer?.name ? `${buyer.name}${buyerDistrict ? ` (${buyerDistrict})` : ''}` : (trip?.unloadingPartyId || 'Your Unloading Site'));
  const origin = trip?.origin || 'Quarry Loading Point';
  const date = trip?.date || new Date().toISOString().slice(0, 10);

  let stoneDetailsText = 'Stone details verified for loading';
  let totalPieces = 0;
  let totalSqft = 0;

  const linesToUse = (stop && Array.isArray(stop.stoneLines) && stop.stoneLines.length > 0)
    ? stop.stoneLines
    : ((Array.isArray(trip?.stoneLines) && trip.stoneLines.length > 0)
      ? trip.stoneLines
      : (order && Array.isArray(order.lines) && order.lines.length > 0 ? order.lines : []));

  if (linesToUse.length > 0) {
    const lines = linesToUse.map((line, idx) => {
      const size = line.size || 'Standard';
      const thickness = line.thickness || '';
      const finish = line.finish ? (line.finish.charAt(0).toUpperCase() + line.finish.slice(1)) : '';
      const pieces = Number(line.pieces) || 0;
      const sqftPerPiece = Number(line.sqftPerPiece) || (size === '3x3' ? 9 : 4);
      const lineSqft = pieces * sqftPerPiece;

      totalPieces += pieces;
      totalSqft += lineSqft;

      const desc = [size, thickness, finish].filter(Boolean).join(' | ');
      return `  ${idx + 1}. *${desc}*\n     Quantity: ${pieces} pcs ${lineSqft > 0 ? `(${lineSqft.toFixed(1)} sq.ft)` : ''}`;
    });
    stoneDetailsText = lines.join('\n');
  } else if (stop?.totalPieces > 0) {
    totalPieces = stop.totalPieces;
    totalSqft = stop.totalSqft || 0;
    stoneDetailsText = `  1. *${stop.stoneSummary || 'Consignment Stone Load'}*\n     Quantity: ${stop.totalPieces} pcs ${stop.totalSqft > 0 ? `(${stop.totalSqft.toFixed(1)} sq.ft)` : ''}`;
  }

  const stopRefSnippet = stop?.stopNumber ? ` (Delivery Stop #${stop.stopNumber})` : '';
  const dueSnippet = (stop?.expectedAmount > 0) 
    ? `\n💰 *Amount Payable upon Delivery:* ₹${Number(stop.expectedAmount).toLocaleString('en-IN')}`
    : '';

  const summary = totalPieces > 0 
    ? `\n📊 *Total Consignment for You:* ${totalPieces} pcs ${totalSqft > 0 ? `| ${totalSqft.toFixed(1)} sq.ft` : ''}`
    : '';

  return (
`🚚 *TRANSIA TRANSPORT — VEHICLE & DRIVER ASSIGNED*

Hello *${buyerName}*! A delivery lorry and driver have been assigned to your stone consignment:

📋 *Order / Consignment Ref:* ${tripCode}${stopRefSnippet}
📅 *Dispatch Date:* ${date}
🏁 *Delivery Destination:* ${destination}

🚛 *Assigned Vehicle:*
• Lorry Registration: *${lorryPlate}*

👨‍✈️ *Assigned Driver Details:*
• Driver Name: *${driverName}*
• Mobile Contact: *${driverPhone}*
📞 _(You can call your driver directly for delivery coordinates & site arrival time)_

📦 *Your Consignment Breakdown:*
${stoneDetailsText}${summary}${dueSnippet}

📍 *Pickup / Loading Point:* ${origin}

⚠️ *Unloading Instructions:*
- Driver will contact you prior to arrival at your destination.
- Please arrange site road clearance and an unloading team.
- Drive safe & verify consignment stone count upon delivery.

📄 *Official E-Way Bill & Delivery Challan (PDF):*
👉 ${process.env.API_BASE_URL || 'http://localhost:9090'}/api/pdf/eway/${trip?.id}/download${stop?.stopNumber ? `?stop=${stop.stopNumber}` : ''}

Thank you for choosing Transia Stone Transport!
_Kerala Quarry Direct Transit · Transia Logistics_`
  );
};

export const whatsappService = {
  /**
   * Send WhatsApp notification for a trip to its assigned driver.
   * @param {Object|string} tripOrId - Trip document or trip id
   */
  async sendDriverTripNotification(tripOrId) {
    let trip = tripOrId;
    if (typeof tripOrId === 'string') {
      trip = await Trip.findOne({ id: tripOrId });
    }

    if (!trip) {
      console.warn(`[WhatsApp Service] Trip not found: ${tripOrId}`);
      return { success: false, reason: 'Trip not found' };
    }

    if (!trip.driverId) {
      console.log(`[WhatsApp Service] Trip ${trip.id} has no driver assigned yet.`);
      return { success: false, reason: 'No driver assigned to trip' };
    }

    // Look up driver
    const driver = await User.findOne({
      role: 'driver',
      $or: [
        { 'driverProfile.id': trip.driverId },
        { _id: mongoose.isValidObjectId(trip.driverId) ? trip.driverId : null },
        { username: trip.driverId }
      ].filter(Boolean)
    });

    if (!driver) {
      console.warn(`[WhatsApp Service] Driver not found for driverId: ${trip.driverId}`);
      return { success: false, reason: `Driver not found for id ${trip.driverId}` };
    }

    const rawPhone = driver.phone;
    const normalizedPhone = normalizePhoneNumber(rawPhone);

    if (!normalizedPhone) {
      console.warn(`[WhatsApp Service] Driver '${driver.name}' does not have a valid phone number (${rawPhone})`);
      return { 
        success: false, 
        reason: `Driver '${driver.name}' does not have a valid phone number`,
        driverName: driver.name
      };
    }

    // Look up destination party / buyer
    let buyer = await User.findOne({
      role: 'buyer',
      $or: [
        { 'buyerProfile.id': trip.unloadingPartyId },
        { _id: mongoose.isValidObjectId(trip.unloadingPartyId) ? trip.unloadingPartyId : null }
      ].filter(Boolean)
    });
    if (!buyer) {
      buyer = await UnloadingParty.findOne({ id: trip.unloadingPartyId });
    }

    // Look up Lorry for plate number
    let lorry = null;
    if (trip.lorryId) {
      lorry = await Lorry.findOne({
        $or: [
          { id: trip.lorryId },
          { _id: mongoose.isValidObjectId(trip.lorryId) ? trip.lorryId : null }
        ].filter(Boolean)
      });
    }

    // Look up Order if stoneLines are empty on trip
    let order = null;
    if ((!trip.stoneLines || trip.stoneLines.length === 0) && trip.orderId) {
      order = await Order.findOne({ id: trip.orderId });
    }

    const messageText = formatTripWhatsAppMessage(trip, driver, buyer, lorry, order);
    const phoneDigits = normalizedPhone.replace('+', '');
    const directWaUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(messageText)}`;

    const provider = (process.env.WHATSAPP_PROVIDER || 'none').toLowerCase().trim();
    let sendResult = { 
      provider, 
      sent: false, 
      phone: normalizedPhone, 
      directWaUrl, 
      messageText 
    };

    try {
      if (provider === 'twilio') {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

        if (!sid || !token) {
          throw new Error('Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) are missing in .env');
        }

        const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
        const authHeader = Buffer.from(`${sid}:${token}`).toString('base64');
        const params = new URLSearchParams({
          From: fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`,
          To: `whatsapp:${normalizedPhone}`,
          Body: messageText
        });

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || `Twilio HTTP Error ${res.status}`);
        }

        console.log(`[WhatsApp Service] Sent message via Twilio to ${normalizedPhone}, SID: ${data.sid}`);
        sendResult.sent = true;
        sendResult.sid = data.sid;

      } else if (provider === 'meta') {
        const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

        if (!phoneId || !accessToken) {
          throw new Error('Meta WhatsApp Cloud API credentials (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN) are missing');
        }

        const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phoneDigits,
            type: 'text',
            text: { body: messageText }
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message || `Meta WhatsApp API error ${res.status}`);
        }

        console.log(`[WhatsApp Service] Sent message via Meta Cloud API to ${normalizedPhone}`);
        sendResult.sent = true;
        sendResult.response = data;

      } else if (provider === 'ultramsg') {
        const instanceId = process.env.ULTRAMSG_INSTANCE_ID;
        const token = process.env.ULTRAMSG_TOKEN;

        if (!instanceId || !token) {
          throw new Error('UltraMsg credentials (ULTRAMSG_INSTANCE_ID, ULTRAMSG_TOKEN) are missing in .env');
        }

        const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
        const params = new URLSearchParams({
          token,
          to: normalizedPhone,
          body: messageText
        });

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || `UltraMsg API error ${res.status}`);
        }

        console.log(`[WhatsApp Service] Sent message via UltraMsg to ${normalizedPhone}, response:`, data);
        sendResult.sent = true;
        sendResult.response = data;

      } else if (provider === 'webhook') {
        const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
        if (!webhookUrl) throw new Error('WHATSAPP_WEBHOOK_URL is not configured');

        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: normalizedPhone,
            driverName: driver.name,
            tripId: trip.id,
            tripCode: trip.code,
            message: messageText
          })
        });

        if (!res.ok) throw new Error(`Webhook returned status ${res.status}`);
        console.log(`[WhatsApp Service] Sent message via webhook to ${normalizedPhone}`);
        sendResult.sent = true;

      } else {
        // Fallback / simulated mode when no paid cloud gateway is attached
        console.log(`[WhatsApp Service] (Simulated / wa.me mode) Formatted trip assignment WhatsApp for ${driver.name} (${normalizedPhone}):\n${messageText}`);
        console.log(`[WhatsApp Service] One-click Direct WhatsApp URL: ${directWaUrl}`);
        sendResult.simulated = true;
      }

      return {
        success: true,
        ...sendResult
      };

    } catch (err) {
      console.error(`[WhatsApp Service] Failed to send WhatsApp message: ${err.message}`);
      return {
        success: false,
        error: err.message,
        directWaUrl,
        messageText
      };
    }
  },

  /**
   * Send arbitrary WhatsApp message to a specific phone number using configured provider.
   * @param {string} toPhone - Recipient phone number
   * @param {string} messageText - Message body
   */
  async sendDirectMessage(toPhone, messageText) {
    const normalizedPhone = normalizePhoneNumber(toPhone);
    if (!normalizedPhone) {
      return { success: false, error: 'Invalid phone number' };
    }

    const provider = (process.env.WHATSAPP_PROVIDER || 'none').toLowerCase().trim();

    try {
      if (provider === 'ultramsg') {
        const instanceId = process.env.ULTRAMSG_INSTANCE_ID;
        const token = process.env.ULTRAMSG_TOKEN;

        if (!instanceId || !token) {
          throw new Error('UltraMsg credentials (ULTRAMSG_INSTANCE_ID, ULTRAMSG_TOKEN) are missing in .env');
        }

        const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
        const params = new URLSearchParams({
          token,
          to: normalizedPhone,
          body: messageText
        });

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || `UltraMsg API error ${res.status}`);
        }

        console.log(`[WhatsApp Service] Sent message via UltraMsg to ${normalizedPhone}`);
        return { success: true, provider: 'ultramsg', phone: normalizedPhone, data };

      } else if (provider === 'twilio') {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

        if (!sid || !token) throw new Error('Twilio credentials missing');

        const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
        const authHeader = Buffer.from(`${sid}:${token}`).toString('base64');
        const params = new URLSearchParams({
          From: fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`,
          To: `whatsapp:${normalizedPhone}`,
          Body: messageText
        });

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || `Twilio HTTP Error ${res.status}`);
        return { success: true, provider: 'twilio', phone: normalizedPhone, sid: data.sid };

      } else {
        console.log(`[WhatsApp Service] (Simulated / None) Message for ${normalizedPhone}:\n${messageText}`);
        return { success: true, provider: 'simulated', phone: normalizedPhone };
      }
    } catch (err) {
      console.error(`[WhatsApp Service] Error sending direct message to ${normalizedPhone}:`, err.message);
      return { success: false, error: err.message, phone: normalizedPhone };
    }
  },

  /**
   * Send PDF or document attachment to a WhatsApp number.
   * @param {string} toPhone 
   * @param {string} documentUrl 
   * @param {string} filename 
   * @param {string} caption 
   */
  async sendDocumentMessage(toPhone, documentUrl, filename, caption = '') {
    const normalizedPhone = normalizePhoneNumber(toPhone);
    if (!normalizedPhone) {
      return { success: false, error: 'Invalid phone number' };
    }

    const provider = (process.env.WHATSAPP_PROVIDER || 'none').toLowerCase().trim();

    try {
      if (provider === 'ultramsg') {
        const instanceId = process.env.ULTRAMSG_INSTANCE_ID;
        const token = process.env.ULTRAMSG_TOKEN;

        if (!instanceId || !token) {
          throw new Error('UltraMsg credentials (ULTRAMSG_INSTANCE_ID, ULTRAMSG_TOKEN) are missing in .env');
        }

        const url = `https://api.ultramsg.com/${instanceId}/messages/document`;
        const params = new URLSearchParams({
          token,
          to: normalizedPhone,
          filename: filename || 'document.pdf',
          document: documentUrl,
          caption: caption || ''
        });

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || `UltraMsg API error ${res.status}`);
        }

        console.log(`[WhatsApp Service] Sent PDF Document via UltraMsg to ${normalizedPhone}`);
        return { success: true, provider: 'ultramsg', phone: normalizedPhone, data };

      } else if (provider === 'meta') {
        const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

        if (!phoneId || !accessToken) throw new Error('Meta credentials missing');

        const phoneDigits = normalizedPhone.replace('+', '');
        const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phoneDigits,
            type: 'document',
            document: {
              link: documentUrl,
              filename: filename || 'document.pdf',
              caption: caption || ''
            }
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || `Meta WhatsApp error ${res.status}`);
        return { success: true, provider: 'meta', phone: normalizedPhone, data };

      } else {
        console.log(`[WhatsApp Service] (Simulated / None) PDF Document for ${normalizedPhone}:\nFile: ${filename}\nLink: ${documentUrl}\nCaption:\n${caption}`);
        return { success: true, provider: 'simulated', phone: normalizedPhone, documentUrl, filename };
      }
    } catch (err) {
      console.error(`[WhatsApp Service] Error sending document to ${normalizedPhone}:`, err.message);
      return { success: false, error: err.message, phone: normalizedPhone };
    }
  },

  /**
   * Generates and dispatches Master Trip Manifest PDF directly to driver's WhatsApp.
   */
  async sendTripManifestToDriver(tripOrId) {
    let trip = tripOrId;
    if (typeof tripOrId === 'string') {
      trip = await Trip.findOne({ id: tripOrId });
    }
    if (!trip) return { success: false, reason: 'Trip not found' };

    let driver = null;
    if (trip.driverId) {
      driver = await User.findOne({
        role: 'driver',
        $or: [
          { 'driverProfile.id': trip.driverId },
          { _id: mongoose.isValidObjectId(trip.driverId) ? trip.driverId : null },
          { username: trip.driverId }
        ].filter(Boolean)
      }) || await Driver.findOne({ id: trip.driverId });
    }

    if (!driver || !driver.phone) {
      return { success: false, reason: 'Driver phone not found or driver not assigned' };
    }

    const manifest = await pdfService.generateTripManifestPDF(trip);
    const caption = `🚚 *TRANSIA MASTER TRIP MANIFEST — ${trip.code || trip.id}*\n\nHello *${driver.name}*, here is your official Master Dispatch & Route Manifest PDF for your assigned lorry delivery.\n\nDirect Download Link:\n👉 ${manifest.downloadUrl}`;

    const sendRes = await this.sendDocumentMessage(driver.phone, manifest.publicUrl, manifest.filename, caption);
    return {
      success: sendRes.success,
      manifestUrl: manifest.publicUrl,
      downloadUrl: manifest.downloadUrl,
      driverPhone: driver.phone,
      driverName: driver.name,
      sendRes
    };
  },

  /**
   * Generates and dispatches E-Way Bill / Delivery Challan PDF directly to Buyer's WhatsApp.
   */
  async sendBuyerEwayBillPDF(tripOrId, stopNumberOrBuyerId = null) {
    let trip = tripOrId;
    if (typeof tripOrId === 'string') {
      trip = await Trip.findOne({ id: tripOrId });
    }
    if (!trip) return { success: false, reason: 'Trip not found' };

    const isMultiDrop = Array.isArray(trip.stops) && trip.stops.length > 1;

    // Multi-drop: send to each buyer if no specific stop requested
    if (isMultiDrop && (stopNumberOrBuyerId === null || stopNumberOrBuyerId === undefined)) {
      const results = [];
      for (const stop of trip.stops) {
        const buyerId = stop.unloadingPartyId;
        let buyer = null;
        if (buyerId) {
          buyer = await User.findOne({
            role: 'buyer',
            $or: [
              { 'buyerProfile.id': buyerId },
              { _id: mongoose.isValidObjectId(buyerId) ? buyerId : null },
              { username: buyerId }
            ].filter(Boolean)
          }) || await UnloadingParty.findOne({ id: buyerId });
        }

        const phone = stop.buyerPhone || buyer?.phone;
        if (!phone) {
          results.push({ stopNumber: stop.stopNumber, success: false, reason: 'Missing phone' });
          continue;
        }

        const eway = await pdfService.generateBuyerEwayBillPDF(trip, stop.stopNumber);
        const caption = `📄 *KERALA GOODS TRANSPORT E-WAY BILL & DELIVERY CHALLAN*\n\nHello *${stop.buyerName || buyer?.name}*, here is your official E-Way Bill and Delivery Challan PDF for your stone consignment (Delivery Stop #${stop.stopNumber}).\n\nDirect Download Link:\n👉 ${eway.downloadUrl}`;
        const res = await this.sendDocumentMessage(phone, eway.publicUrl, eway.filename, caption);
        results.push({
          stopNumber: stop.stopNumber,
          buyerName: stop.buyerName || buyer?.name,
          phone,
          ewayUrl: eway.publicUrl,
          downloadUrl: eway.downloadUrl,
          success: res.success,
          res
        });
      }
      return { success: results.some(r => r.success), multiDrop: true, results };
    }

    // Single stop or specific stop requested
    const eway = await pdfService.generateBuyerEwayBillPDF(trip, stopNumberOrBuyerId);
    let targetStop = trip.stops && trip.stops.length > 0 ? (trip.stops.find(s => String(s.stopNumber) === String(stopNumberOrBuyerId)) || trip.stops[0]) : null;
    const buyerId = targetStop?.unloadingPartyId || trip.unloadingPartyId;

    let buyer = null;
    if (buyerId) {
      buyer = await User.findOne({
        role: 'buyer',
        $or: [
          { 'buyerProfile.id': buyerId },
          { _id: mongoose.isValidObjectId(buyerId) ? buyerId : null },
          { username: buyerId }
        ].filter(Boolean)
      }) || await UnloadingParty.findOne({ id: buyerId });
    }

    const phone = targetStop?.buyerPhone || buyer?.phone;
    if (!phone) return { success: false, reason: 'Buyer phone not found' };

    const caption = `📄 *KERALA GOODS TRANSPORT E-WAY BILL & DELIVERY CHALLAN*\n\nHello *${targetStop?.buyerName || buyer?.name || 'Customer'}*, here is your official E-Way Bill and Delivery Challan PDF for your stone consignment.\n\nDirect Download Link:\n👉 ${eway.downloadUrl}`;
    const sendRes = await this.sendDocumentMessage(phone, eway.publicUrl, eway.filename, caption);

    return {
      success: sendRes.success,
      ewayUrl: eway.publicUrl,
      downloadUrl: eway.downloadUrl,
      buyerName: targetStop?.buyerName || buyer?.name,
      buyerPhone: phone,
      sendRes
    };
  },

  /**
   * Send WhatsApp notification to the Buyer when vehicle/lorry and driver are assigned to the trip/order.
   * @param {Object|string} tripOrId - Trip document or trip id
   */
  async sendBuyerTripNotification(tripOrId) {
    let trip = tripOrId;
    if (typeof tripOrId === 'string') {
      trip = await Trip.findOne({ id: tripOrId });
    }

    if (!trip) {
      console.warn(`[WhatsApp Service] Trip not found for buyer notification: ${tripOrId}`);
      return { success: false, reason: 'Trip not found' };
    }

    // Look up driver
    let driver = null;
    if (trip.driverId) {
      driver = await User.findOne({
        role: 'driver',
        $or: [
          { 'driverProfile.id': trip.driverId },
          { _id: mongoose.isValidObjectId(trip.driverId) ? trip.driverId : null },
          { username: trip.driverId }
        ].filter(Boolean)
      });
      if (!driver) {
        driver = await Driver.findOne({ id: trip.driverId });
      }
    }

    // Look up Lorry for plate number
    let lorry = null;
    if (trip.lorryId) {
      lorry = await Lorry.findOne({
        $or: [
          { id: trip.lorryId },
          { _id: mongoose.isValidObjectId(trip.lorryId) ? trip.lorryId : null }
        ].filter(Boolean)
      });
    }

    // Multi-drop trip case: notify each buyer for their respective stop
    if (Array.isArray(trip.stops) && trip.stops.length > 1) {
      const results = [];
      for (const stop of trip.stops) {
        let buyer = null;
        if (stop.unloadingPartyId) {
          buyer = await User.findOne({
            role: 'buyer',
            $or: [
              { 'buyerProfile.id': stop.unloadingPartyId },
              { _id: mongoose.isValidObjectId(stop.unloadingPartyId) ? stop.unloadingPartyId : null },
              { username: stop.unloadingPartyId }
            ].filter(Boolean)
          }) || await UnloadingParty.findOne({ id: stop.unloadingPartyId });
        }

        const rawPhone = stop.buyerPhone || buyer?.phone;
        const normalizedPhone = normalizePhoneNumber(rawPhone);

        if (!normalizedPhone) {
          console.warn(`[WhatsApp Service] Stop #${stop.stopNumber} buyer (${stop.buyerName || stop.unloadingPartyId}) has no valid phone: ${rawPhone}`);
          results.push({
            stopNumber: stop.stopNumber,
            buyerName: stop.buyerName || buyer?.name,
            success: false,
            reason: 'Invalid or missing phone number'
          });
          continue;
        }

        let stopOrder = null;
        if (stop.orderId) {
          stopOrder = await Order.findOne({ id: stop.orderId });
        }

        const messageText = formatBuyerTripWhatsAppMessage(trip, driver, buyer, lorry, stopOrder, stop);
        console.log(`[WhatsApp Service] Sending Multi-Drop Stop #${stop.stopNumber} alert to ${stop.buyerName || buyer?.name} (${normalizedPhone})...`);

        const res = await this.sendDirectMessage(normalizedPhone, messageText);
        results.push({
          stopNumber: stop.stopNumber,
          buyerName: stop.buyerName || buyer?.name,
          buyerPhone: normalizedPhone,
          success: res.success,
          messageText,
          res
        });
      }

      return {
        success: results.some(r => r.success),
        multiDrop: true,
        stopsNotified: results
      };
    }

    // Single destination trip case
    let buyer = await User.findOne({
      role: 'buyer',
      $or: [
        { 'buyerProfile.id': trip.unloadingPartyId },
        { _id: mongoose.isValidObjectId(trip.unloadingPartyId) ? trip.unloadingPartyId : null },
        { username: trip.unloadingPartyId }
      ].filter(Boolean)
    });
    if (!buyer) {
      buyer = await UnloadingParty.findOne({
        $or: [
          { id: trip.unloadingPartyId },
          { _id: mongoose.isValidObjectId(trip.unloadingPartyId) ? trip.unloadingPartyId : null }
        ].filter(Boolean)
      });
    }

    let order = null;
    if (trip.orderId) {
      order = await Order.findOne({ id: trip.orderId });
      if ((!buyer || !buyer.phone) && order?.unloadingPartyId) {
        buyer = await UnloadingParty.findOne({ id: order.unloadingPartyId }) ||
          await User.findOne({
            role: 'buyer',
            $or: [
              { 'buyerProfile.id': order.unloadingPartyId },
              { username: order.unloadingPartyId }
            ]
          });
      }
    }

    const rawBuyerPhone = buyer?.phone;
    const normalizedBuyerPhone = normalizePhoneNumber(rawBuyerPhone);

    if (!normalizedBuyerPhone) {
      console.warn(`[WhatsApp Service] Buyer '${buyer?.name || trip.unloadingPartyId}' does not have a valid phone number (${rawBuyerPhone})`);
      return { 
        success: false, 
        reason: 'Buyer phone number not found or invalid',
        buyerName: buyer?.name 
      };
    }

    const firstStop = (Array.isArray(trip.stops) && trip.stops.length === 1) ? trip.stops[0] : null;
    const messageText = formatBuyerTripWhatsAppMessage(trip, driver, buyer, lorry, order, firstStop);
    console.log(`[WhatsApp Service] Sending Driver & Vehicle Assignment Alert to Buyer ${buyer?.name || ''} (${normalizedBuyerPhone})...`);

    const result = await this.sendDirectMessage(normalizedBuyerPhone, messageText);
    return {
      success: result.success,
      buyerPhone: normalizedBuyerPhone,
      buyerName: buyer?.name,
      messageText,
      result
    };
  }
};

