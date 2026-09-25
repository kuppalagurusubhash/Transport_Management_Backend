import { whatsappBotService } from '../services/whatsappBot.service.js';
import { whatsappService, normalizePhoneNumber } from '../services/whatsapp.service.js';


export const handleWebhook = async (req, res, next) => {
  try {
    const payload = req.body || {};
    console.log('[WhatsApp Webhook] Received payload:', JSON.stringify(payload));

    // UltraMsg format: { event_type: 'message_received', data: { from, to, body, pushname, fromMe, self } }
    const messageData = payload.data || payload;

    // Ignore if sent by ourselves
    if (messageData.fromMe || messageData.self) {
      return res.status(200).json({ status: 'ignored', reason: 'Self message' });
    }

    const from = messageData.from || messageData.phone;
    const body = messageData.body || messageData.message || messageData.text;
    const pushname = messageData.pushname || messageData.author || 'Customer';

    if (!from || !body) {
      return res.status(200).json({ status: 'ignored', reason: 'Not a chat message' });
    }

    const result = await whatsappBotService.handleIncomingMessage({
      from,
      body,
      pushname
    });

    res.status(200).json({
      status: 'ok',
      result
    });
  } catch (err) {
    console.error('[WhatsApp Webhook Error]:', err);
    res.status(200).json({ status: 'error', error: err.message });
  }
};

export const verifyWebhook = (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Transia WhatsApp Bot Webhook',
    timestamp: new Date().toISOString()
  });
};

export const simulateIncomingMessage = async (req, res, next) => {
  try {
    const { from, body, pushname } = req.body;
    if (!from || !body) {
      return res.status(400).json({ error: 'from and body are required' });
    }

    const result = await whatsappBotService.handleIncomingMessage({
      from,
      body,
      pushname: pushname || 'Test User'
    });

    res.status(200).json({ success: true, result });
  } catch (err) {
    next(err);
  }
};

export const sendCatalogLink = async (req, res, next) => {
  try {
    const { phone, name } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'phone is required' });
    }
    const normalizedPhone = normalizePhoneNumber(phone);
    const catalogUrl = process.env.CATALOG_URL || 'https://catalogapp-six.vercel.app/';
    const displayName = name || 'Valued Customer';

    const message = (
`🏛️ *TRANSIA STONE CATALOG & LIVE QUARRY RATES*

Hello *${displayName}*!

Here is our stone catalog and interactive lorry load calculator:
👉 ${catalogUrl}

✨ *What you can do:*
• Browse Kadapa natural black stone varieties (2×2, 3×3, 30mm/40mm/50mm)
• View natural rough and mirror polished finishes
• Check live district delivery rates across Kerala
• Estimate lorry load and place orders directly

_Transia Stone Transport · Kerala Direct Supply_`
    );

    const sendResult = await whatsappService.sendDirectMessage(normalizedPhone, message);

    res.status(200).json({
      success: sendResult.success,
      phone: normalizedPhone,
      catalogUrl,
      result: sendResult
    });
  } catch (err) {
    next(err);
  }
};
