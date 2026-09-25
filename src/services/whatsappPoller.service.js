import { whatsappBotService } from './whatsappBot.service.js';

class WhatsAppPollerService {
  constructor() {
    this.intervalId = null;
    this.isPolling = false;
    this.processedMessageIds = new Set();
    this.pollingIntervalMs = 3000; // Check every 3 seconds
  }

  start() {
    const provider = (process.env.WHATSAPP_PROVIDER || 'none').toLowerCase().trim();
    if (provider !== 'ultramsg') {
      console.log(`[WhatsApp Poller] Poller disabled (WHATSAPP_PROVIDER is '${provider}')`);
      return;
    }

    if (this.intervalId) return;

    console.log(`[WhatsApp Poller] Starting live UltraMsg message polling every ${this.pollingIntervalMs / 1000}s...`);
    this.intervalId = setInterval(() => this.poll(), this.pollingIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[WhatsApp Poller] Stopped message polling.');
    }
  }

  async poll() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const instanceId = process.env.ULTRAMSG_INSTANCE_ID;
      const token = process.env.ULTRAMSG_TOKEN;

      if (!instanceId || !token) {
        this.stop();
        return;
      }

      // 1. Fetch active chats
      const chatsUrl = `https://api.ultramsg.com/${instanceId}/chats?token=${token}`;
      const chatsRes = await fetch(chatsUrl);
      if (!chatsRes.ok) return;

      const chats = await chatsRes.json();
      if (!Array.isArray(chats)) return;

      // Filter chats with unread messages from actual contacts
      const unreadChats = chats.filter(c => c && c.unread > 0 && c.id && !c.id.startsWith('0@'));

      for (const chat of unreadChats) {
        await this.processChatMessages(instanceId, token, chat);
      }
    } catch (err) {
      // Silent error logging to avoid flooding terminal
      // console.error('[WhatsApp Poller] Error:', err.message);
    } finally {
      this.isPolling = false;
    }
  }

  async processChatMessages(instanceId, token, chat) {
    try {
      const messagesUrl = `https://api.ultramsg.com/${instanceId}/chats/messages?token=${token}&chatId=${encodeURIComponent(chat.id)}&limit=5`;
      const msgRes = await fetch(messagesUrl);
      if (!msgRes.ok) return;

      const messages = await msgRes.json();
      if (!Array.isArray(messages)) return;

      for (const msg of messages) {
        if (!msg || msg.fromMe || !msg.body) continue;

        // Prevent duplicate processing
        if (this.processedMessageIds.has(msg.id)) continue;
        this.processedMessageIds.add(msg.id);

        // Keep set size manageable
        if (this.processedMessageIds.size > 2000) {
          const arr = Array.from(this.processedMessageIds);
          this.processedMessageIds = new Set(arr.slice(-1000));
        }

        console.log(`[WhatsApp Poller] Processing incoming message from ${msg.from}: "${msg.body}"`);

        // Execute Bot response
        await whatsappBotService.handleIncomingMessage({
          from: msg.from,
          body: msg.body,
          pushname: chat.name || 'Customer'
        });
      }

      // Mark chat as read in UltraMsg
      await fetch(`https://api.ultramsg.com/${instanceId}/chats/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token, chatId: chat.id })
      });
    } catch (err) {
      console.error(`[WhatsApp Poller] Error processing chat ${chat.id}:`, err.message);
    }
  }
}

export const whatsappPollerService = new WhatsAppPollerService();
