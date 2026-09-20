import { User } from '../models/User.js';
import { Trip } from '../models/Trip.js';
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
 */
export const formatTripWhatsAppMessage = (trip, driver, buyer) => {
  const driverName = driver?.name || 'Driver';
  const tripCode = trip.code || trip.id || 'N/A';
  const lorryId = trip.lorryId || 'Assigned Lorry';
  const origin = trip.origin || 'Quarry Loading Point';
  const destination = buyer?.name 
    ? `${buyer.name}${buyer.buyerProfile?.district ? ` (${buyer.buyerProfile.district})` : ''}`
    : (trip.unloadingPartyId || 'Customer Unloading Site');
  const date = trip.date || new Date().toISOString().slice(0, 10);

  let stoneDetailsText = 'No stone details provided';
  let totalPieces = 0;
  let totalSqft = 0;

  if (Array.isArray(trip.stoneLines) && trip.stoneLines.length > 0) {
    const lines = trip.stoneLines.map((line, idx) => {
      const size = line.size || 'Standard';
      const thickness = line.thickness || '';
      const finish = line.finish ? (line.finish.charAt(0).toUpperCase() + line.finish.slice(1)) : '';
      const pieces = Number(line.pieces) || 0;
      const sqftPerPiece = Number(line.sqftPerPiece) || 0;
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
`🚚 *TRANSIA TRANSPORT - NEW TRIP ASSIGNMENT*

Hello *${driverName}*, a trip has been assigned to you.

📋 *Trip Code:* ${tripCode}
🚛 *Lorry:* ${lorryId}
📅 *Date:* ${date}

📍 *Pickup / Loading:* ${origin}
🏁 *Delivery / Destination:* ${destination}

📦 *Stone Details:*
${stoneDetailsText}${summary}

⚠️ *Driver Instructions:*
- Please inspect stone count & quality before dispatch.
- Confirm pickup with the loading supervisor upon arrival.
- Drive safely!

_Automated update from Transia Logistics Management_`
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
    const buyer = await User.findOne({
      role: 'buyer',
      $or: [
        { 'buyerProfile.id': trip.unloadingPartyId },
        { _id: mongoose.isValidObjectId(trip.unloadingPartyId) ? trip.unloadingPartyId : null }
      ].filter(Boolean)
    });

    const messageText = formatTripWhatsAppMessage(trip, driver, buyer);
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
  }
};
