import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { UnloadingParty } from '../models/UnloadingParty.js';
import { DistrictRate } from '../models/DistrictRate.js';
import { StoneCatalog } from '../models/StoneCatalog.js';
import { Order } from '../models/Order.js';
import { Trip } from '../models/Trip.js';
import { Notification } from '../models/Notification.js';
import { whatsappService, normalizePhoneNumber } from './whatsapp.service.js';
import { buyerLedgerService } from './buyerLedger.service.js';

export const whatsappBotService = {
  /**
   * Look up buyer by sender phone number.
   */
  async findBuyerByPhone(phone) {
    if (!phone) return null;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const last10Digits = cleanPhone.slice(-10);

    // 1. Try UnloadingParty collection
    let party = await UnloadingParty.findOne({
      $or: [
        { phone: new RegExp(last10Digits + '$') },
        { phone: phone }
      ]
    });
    if (party) return party;

    // 2. Try User collection where role is buyer
    const user = await User.findOne({
      role: 'buyer',
      $or: [
        { phone: new RegExp(last10Digits + '$') },
        { phone: phone }
      ]
    });
    if (user && user.buyerProfile) {
      return {
        id: user.buyerProfile.id,
        name: user.name,
        phone: user.phone,
        district: user.buyerProfile.district,
        totalOrdered: user.buyerProfile.totalOrdered || 0,
        paid: user.buyerProfile.paid || 0,
        pending: user.buyerProfile.pending || 0,
        userId: user._id
      };
    }

    return null;
  },

  /**
   * Calculate orders, remaining due, pending amount, and settlements for a buyer.
   */
  async getBuyerFinancialSummary(buyer) {
    if (!buyer || (!buyer.id && !buyer.phone)) {
      return {
        matched: false,
        totalOrdersCount: 0,
        activeOrdersCount: 0,
        totalOrdered: 0,
        settlementsPaid: 0,
        totalPaid: 0,
        totalDamage: 0,
        remainingDue: 0,
        recentOrders: [],
        activeTrips: []
      };
    }

    const res = await buyerLedgerService.calculateBuyerLedger(buyer.id || buyer.phone);
    return {
      ...res,
      settlementsPaid: res.totalPaid
    };
  },

  /**
   * Handle incoming message from WhatsApp Webhook.
   */
  async handleIncomingMessage({ from, body, pushname = 'Valued Customer' }) {
    if (!from || !body) return { ignored: true, reason: 'Missing from or body' };

    // Clean sender phone
    const rawNumber = from.replace(/@.*$/, '').replace(/[^0-9+]/g, '');
    const normalizedPhone = normalizePhoneNumber(rawNumber);
    const text = String(body).trim();
    const upperText = text.toUpperCase();

    // Prevent replying to own messages
    const myNumber = (process.env.ULTRAMSG_CONNECTED_NUMBER || '7732000110').replace(/[^0-9]/g, '');
    if (rawNumber.includes(myNumber)) {
      console.log('[WhatsApp Bot] Ignored message from self/business number.');
      return { ignored: true, reason: 'Self message' };
    }

    console.log(`[WhatsApp Bot] Incoming message from ${normalizedPhone} (${pushname}): "${text}"`);

    // Find buyer if registered
    const buyer = await this.findBuyerByPhone(normalizedPhone);
    const buyerName = buyer?.name || pushname || 'Valued Customer';
    const buyerDistrict = buyer?.district || 'Palakkad';

    let replyMessage = '';

    const catalogUrl = process.env.CATALOG_URL || 'https://catalogapp-six.vercel.app/';

    // Check command triggers explicitly so bot DOES NOT reply to every random message
    const isGreeting = (
      /^(HI+|HELLO+|HEY+|HY|START|MENU|HELP|NAMASTE|VANAKKAM|NAMASKARAM)[!.]*$/i.test(text) ||
      /^(HI+|HELLO+|HEY+)\s+(TRANSIA|SIR|TEAM|BRO|ALL|BOT)?[!.]*$/i.test(text) ||
      ['HI', 'HII', 'HIII', 'HELLO', 'HEY', 'START', 'MENU', 'HELP'].includes(upperText)
    );

    const isRates = (
      upperText === 'RATES' ||
      upperText === 'RATE' ||
      upperText === 'PRICE' ||
      upperText === 'PRICES' ||
      upperText === '3' ||
      /^(RATES|RATE|PRICE|PRICES)\b/i.test(text)
    );

    const isCatalog = (
      upperText === 'CATALOG' ||
      upperText === 'STONES' ||
      upperText === 'VARIETIES' ||
      upperText === 'PRODUCTS' ||
      upperText === 'LINK' ||
      upperText === 'WEBSITE' ||
      upperText === 'PORTAL' ||
      upperText === 'APP' ||
      upperText === '2' ||
      /^(CATALOG|STONES|VARIETIES)\b/i.test(text)
    );

    const isStatus = (
      upperText === 'STATUS' ||
      upperText === 'TRACK' ||
      upperText === 'ORDERS' ||
      upperText === 'MY ORDERS' ||
      upperText === 'MY ORDER' ||
      upperText === 'ORDER STATUS' ||
      upperText === 'TRACK ORDER' ||
      upperText === '4' ||
      /^(STATUS|TRACK|ORDERS|MY ORDERS)\b/i.test(text)
    );

    const isOrder = (
      upperText.startsWith('ORDER') ||
      /\bORDER\b/i.test(text)
    );

    const isBalance = (
      upperText === 'BALANCE' ||
      upperText === 'BAL' ||
      upperText === 'STATEMENT' ||
      upperText === 'ACCOUNT' ||
      upperText === 'PENDING' ||
      upperText === 'DUE' ||
      upperText === 'SETTLE' ||
      upperText === 'PAY' ||
      upperText === 'PAYMENT' ||
      upperText === '5' ||
      /^(BALANCE|STATEMENT|SETTLE|DUE)\b/i.test(text)
    );

    const isPdf = (
      upperText === 'PDF' ||
      upperText === 'BILL' ||
      upperText === 'INVOICE' ||
      upperText === 'EWAY' ||
      upperText === 'CHALLAN' ||
      upperText === 'MANIFEST' ||
      upperText === '6' ||
      /^(PDF|BILL|INVOICE|EWAY|CHALLAN|MANIFEST)\b/i.test(text)
    );

    const isRegister = upperText.startsWith('REGISTER');

    // Route commands strictly
    if (isGreeting) {
      replyMessage = await this.generateAccountWelcomeMessage(buyer, normalizedPhone, buyerName, catalogUrl);
    } else if (isRates) {
      replyMessage = await this.generateRatesMessage(buyerDistrict, buyerName, catalogUrl);
    } else if (isCatalog) {
      replyMessage = await this.generateCatalogMessage(buyerDistrict, buyerName, catalogUrl);
    } else if (isStatus) {
      replyMessage = await this.generateStatusMessage(buyer, normalizedPhone, buyerName);
    } else if (isOrder) {
      replyMessage = await this.handleOrderCommand({
        commandText: text,
        buyer,
        senderPhone: normalizedPhone,
        pushname: buyerName
      });
    } else if (isBalance) {
      replyMessage = await this.generateSettlementMessage(buyer, normalizedPhone, buyerName);
    } else if (isPdf) {
      replyMessage = await this.handlePdfRequest(buyer, normalizedPhone, buyerName);
    } else if (isRegister) {
      replyMessage = await this.handleRegisterCommand({
        commandText: text,
        senderPhone: normalizedPhone,
        pushname
      });
    } else {
      // Unrecognized / casual chat message (e.g. "ok", "thank you", driver status, random replies).
      // DO NOT send message to avoid spamming the user on every incoming message.
      console.log(`[WhatsApp Bot] Ignored non-command message from ${normalizedPhone}: "${text}"`);
      return {
        ignored: true,
        reason: 'Bot only responds when HI, STATUS, ORDER, RATES, etc. are sent.',
        phone: normalizedPhone,
        command: text
      };
    }

    // Send reply via UltraMsg only when a recognized command matched
    const sendResult = await whatsappService.sendDirectMessage(normalizedPhone, replyMessage);

    return {
      success: sendResult.success,
      phone: normalizedPhone,
      command: text,
      replySent: sendResult.success,
      replyMessage
    };
  },

  /**
   * Generates the rich Account Statement when the user says "HI" or greets.
   * Matches buyer, displays total orders, remaining due, settlements paid, then options.
   */
  async generateAccountWelcomeMessage(buyer, normalizedPhone, pushname, catalogUrl) {
    const summary = await this.getBuyerFinancialSummary(buyer);

    if (summary.matched) {
      const remainingFormatted = summary.remainingDue > 0
        ? `⚠️ *Remaining Due (Pending):* *₹${summary.remainingDue.toLocaleString('en-IN')}*`
        : `✨ *Remaining Due:* *₹0 (Fully Settled)*`;

      let recentOrderSnippet = '';
      if (summary.recentOrders && summary.recentOrders.length > 0) {
        const latest = summary.recentOrders[0];
        const statusBadge = latest.status === 'dispatched' ? '🚛 Dispatched'
          : latest.status === 'delivered' ? '✅ Delivered'
          : latest.status === 'confirmed' ? '📋 Confirmed'
          : '⏳ Placed';
        recentOrderSnippet = `\n📦 *Latest Order:* ${latest.code} (${statusBadge})`;
      }

      return (
`👋 *Hello, ${summary.buyerName}!*
📍 District: *${summary.buyerDistrict}*
📱 Phone: *${normalizedPhone}*

💼 *YOUR ACCOUNT SUMMARY:*
━━━━━━━━━━━━━━━━━━━━━
📦 *Total Orders:* ${summary.totalOrdersCount} (${summary.activeOrdersCount} active)
💰 *Total Billed / Ordered:* ₹${summary.totalOrdered.toLocaleString('en-IN')}
✅ *Settlements (Paid):* ₹${summary.settlementsPaid.toLocaleString('en-IN')}
${remainingFormatted}
━━━━━━━━━━━━━━━━━━━━━${recentOrderSnippet}

📱 *Browse Full Stone Catalog with Photos:*
👉 ${catalogUrl}

👉 *How would you like to proceed?*
1️⃣ *ORDER 2x2 30mm 150 pcs* — Place a new consignment
2️⃣ *CATALOG* — View numbered stone varieties with codes
3️⃣ *RATES* — View stone prices for ${summary.buyerDistrict}
4️⃣ *STATUS* — Detailed order tracking & lorry dispatches
5️⃣ *SETTLE* — Payment details & bank account for due clearance
6️⃣ *PDF* — Instant Delivery Challan & E-Way Bill PDF

_Transia Stone Transport · Fast Delivery across Kerala_`
      );
    } else {
      return (
`👋 *Welcome to Transia Stone Transport!*

Hello *${pushname}*, your phone (*${normalizedPhone}*) is not yet linked to an active buyer account.

💼 *ACCOUNT SUMMARY:*
━━━━━━━━━━━━━━━━━━━━━
📦 *Total Orders:* 0
✅ *Settlements:* ₹0
⚠️ *Remaining Due:* ₹0
━━━━━━━━━━━━━━━━━━━━━

📱 *Browse Full Stone Catalog with Photos:*
👉 ${catalogUrl}

👉 *How would you like to proceed?*
1️⃣ *CATALOG* — View stone varieties & codes
2️⃣ *RATES* — Check stone price list for your district
3️⃣ *ORDER 2x2 30mm 150 pcs* — Place an order directly
4️⃣ *REGISTER <Shop Name> <District>* — Create your buyer profile

_Fast delivery across Palakkad, Wayanad, Kannur, Thrissur & Ernakulam._`
      );
    }
  },

  /**
   * Command: CATALOG
   */
  async generateCatalogMessage(district = 'Palakkad', buyerName, catalogUrl) {
    let items = [];
    try {
      items = await StoneCatalog.find({ inStock: true }).sort({ code: 1 });
    } catch {
      items = [];
    }
    if (!items || items.length === 0) {
      items = [
        { code: 'ST-01', name: 'Kadappa Natural Black Stone', availableSizes: ['2x2', '3x3'], baseRatePerSqft: 38 },
        { code: 'ST-02', name: 'Betamcherla Natural Limestone', availableSizes: ['2x2', '3x3'], baseRatePerSqft: 40 },
        { code: 'ST-03', name: 'Tandur Yellow Limestone', availableSizes: ['2x2', '3x3'], baseRatePerSqft: 42 },
        { code: 'ST-04', name: 'Tandur Blue / Grey Paving Stone', availableSizes: ['2x2', '3x3'], baseRatePerSqft: 44 }
      ];
    }

    const catalogList = items.map((item, idx) => {
      const sizes = item.availableSizes?.join(', ') || '2x2, 3x3';
      return `${idx + 1}️⃣ *[${item.code}] ${item.name}*\n   • Sizes: ${sizes}\n   • Approx: *₹${item.baseRatePerSqft}/sq.ft*`;
    }).join('\n\n');

    return (
`🏛️ *TRANSIA STONE VARIETIES & CATALOG*

Hello *${buyerName}*, here are our primary quarry stone varieties:

${catalogList}

───────────────
📱 *Browse Photos & Specifications Online:*
👉 ${catalogUrl}

💡 *How to Order with Code:*
Reply: *ORDER <code/number> <pieces>*
Examples:
👉 *ORDER ST-01 500 pcs*
👉 *ORDER 2 600 pcs*
👉 *ORDER 2x2 30mm 400 pcs*`
    );
  },

  /**
   * Command: SETTLE / PAY / DUE
   */
  async generateSettlementMessage(buyer, senderPhone, buyerName) {
    const summary = await this.getBuyerFinancialSummary(buyer);
    const dueAmount = summary.remainingDue || 0;
    const damageSnippet = summary.totalDamage > 0 
      ? `\n• Damage / Breakage Deduction: -₹${summary.totalDamage.toLocaleString('en-IN')}`
      : '';

    return (
`💳 *ACCOUNT BALANCE & SETTLEMENT DETAILS*

Buyer: *${summary.buyerName || buyerName}*
📍 District: *${summary.buyerDistrict || 'Palakkad'}*

📊 *Financial Ledger Overview:*
• Total Consignments Billed: ₹${summary.totalOrdered.toLocaleString('en-IN')}
• Total Paid (Cash to Driver / PhonePe): ₹${summary.settlementsPaid.toLocaleString('en-IN')}${damageSnippet}
• ⚠️ *Current Outstanding Due:* *₹${dueAmount.toLocaleString('en-IN')}*

───────────────
🏦 *Bank Transfer / NEFT Details:*
• *Bank:* State Bank of India
• *Account Name:* Transia Logistics Management
• *Account No:* 98765432101234
• *IFSC Code:* SBIN0001234

📲 *UPI Payment:*
• *UPI ID:* transia@upi _(or 7732000110@upi)_

───────────────
_After transferring, please send your payment screenshot or UTR number right here for instant receipt confirmation!_`
    );
  },

  /**
   * Command: REGISTER <Shop Name> <District>
   */
  async handleRegisterCommand({ commandText, senderPhone, pushname }) {
    const parts = commandText.replace(/^REGISTER\s*/i, '').trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) {
      return `⚠️ *How to Register:* Reply: *REGISTER <Your Shop Name> <District>*\nExample: *REGISTER Malabar Builders Palakkad*`;
    }

    const district = parts.length > 1 ? parts[parts.length - 1] : 'Palakkad';
    const shopName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];

    const buyerId = `up-wa-${Date.now()}`;
    const newBuyer = new UnloadingParty({
      id: buyerId,
      name: shopName,
      phone: senderPhone,
      district: district,
      totalOrdered: 0,
      paid: 0,
      pending: 0
    });

    await newBuyer.save();

    return (
`🎉 *REGISTRATION SUCCESSFUL!*

Hello *${shopName}*, your buyer account has been created:
📍 District: *${district}*
📱 Phone: *${senderPhone}*

💼 *Your Account Status:*
• Remaining Due: ₹0
• Settlements: ₹0

👉 *Reply *RATES* to check stone prices or *ORDER 2x2 30mm 150 pcs* to place your first consignment!*`
    );
  },

  /**
   * Command: RATES
   */
  async generateRatesMessage(district = 'Palakkad', buyerName, catalogUrl) {
    const rates = await DistrictRate.find({ district: new RegExp(`^${district}$`, 'i') });

    let rateLines = '';
    if (rates.length > 0) {
      rateLines = rates.map(r => {
        const sqftPerPiece = r.size === '3x3' ? 9 : (r.size === '2x2' ? 4 : 4);
        const perPiece = (r.ratePerSqft * sqftPerPiece).toFixed(0);
        const finishFormatted = r.finish ? (r.finish.charAt(0).toUpperCase() + r.finish.slice(1)) : 'Rough';
        return `• *${r.size}* (${r.thickness}, ${finishFormatted})\n   ↳ Rate: *₹${r.ratePerSqft}/sq.ft* (approx ₹${perPiece}/pc)`;
      }).join('\n\n');
    } else {
      rateLines = `• Standard 2x2 (30mm Rough): ₹38/sq.ft\n• Standard 2x2 (40mm Polish): ₹42/sq.ft\n• Standard 3x3 (40mm Polish): ₹45/sq.ft`;
    }

    const catalogLinkSnippet = catalogUrl ? `\n\n📱 *View Photos & Variety Catalog Online:*\n👉 ${catalogUrl}\n` : '';

    return (
`📊 *TRANSIA STONE RATES — ${district.toUpperCase()}*

Hello *${buyerName}*, here are current verified rates for *${district}*:

${rateLines}${catalogLinkSnippet}
───────────────
💡 *How to Order:*
Reply: *ORDER <size> <thickness> <pieces>*
Examples:
👉 *ORDER 2x2 30mm 150 pcs*
👉 *ORDER ST-01 500 pcs* (Kadappa Black)`
    );
  },

  /**
   * Helper to calculate sqft per piece from size string.
   * Supports "2x2", "2*2", "5*5", "3x3", "4x2", "2.5x2.5", etc.
   */
  calculateSqftPerPiece(size) {
    if (!size) return 4;
    const match = String(size).match(/^([0-9]+(?:\.[0-9]+)?)\s*[xX*]\s*([0-9]+(?:\.[0-9]+)?)$/);
    if (match) {
      const w = parseFloat(match[1]);
      const h = parseFloat(match[2]);
      if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
        return Math.round((w * h) * 100) / 100;
      }
    }
    if (size === '3x3') return 9;
    return 4;
  },

  /**
   * Splits multi-line or multi-item WhatsApp order input into candidate item strings.
   */
  splitOrderItems(commandText) {
    const rawLines = commandText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];

    for (const rawLine of rawLines) {
      let line = rawLine.replace(/^[•*\-#~—]+\s*/, '').trim();
      line = line.replace(/^[0-9]{1,2}[.)]\s*/, '').trim();
      if (!line || line.startsWith('==') || line.startsWith('--') || line.startsWith('━━')) continue;
      if (/^(?:Total|Est\.|Estimated|Recommended|Hello|Grand|Delivery District|Consignment|📍|📦|📊|💰|⚖️|🚛)/i.test(line)) continue;

      if (/(?:^|\s+)ORDER\s+/i.test(line)) {
        const parts = line.split(/(?=\bORDER\b)/i).map(p => p.trim()).filter(Boolean);
        for (const p of parts) {
          const cleanP = p.replace(/^[0-9]{1,2}[.)]\s*/, '').trim();
          if (cleanP && cleanP.length > 2) items.push(cleanP);
        }
      } else if (/\b[0-9]{1,6}\s*(?:pcs|pieces|nos|slabs)\b/i.test(line)) {
        items.push(line);
      }
    }

    if (items.length === 1 && (items[0].includes(',') || items[0].includes(';'))) {
      const commaParts = items[0].split(/[,;]+/).map(p => p.trim()).filter(Boolean);
      const validParts = commaParts.filter(p => /\b[0-9]{1,6}\b/.test(p));
      if (validParts.length > 1) return commaParts;
    }

    return items;
  },

  /**
   * Parse a single candidate order line into stone parameters.
   */
  async parseSingleOrderLine(rawText, district) {
    let text = rawText.trim();
    // Strip bullet points, list numbers (1., 1), etc.
    text = text.replace(/^([0-9]{1,2}[.)]\s*|[-•*~—]\s*)+/g, '').trim();
    text = text.replace(/^ORDER\s*/i, '').trim();
    text = text.replace(/[,;]+$/, '').trim();

    if (!text) return null;

    let size = '2x2';
    let thickness = '30mm';
    let finish = 'rough';
    let pieces = 0;
    let stoneItemName = null;
    let catalogItem = null;

    // Check for catalog item code (e.g. KB-22-30R, KB-22-40P, ST-01, etc.)
    const kbCodeMap = {
      'KB-22-30R': { size: '2x2', thickness: '30mm', finish: 'rough', name: '2x2 Natural Rough Split' },
      'KB-22-40P': { size: '2x2', thickness: '40mm', finish: 'polish', name: '2x2 Calibrated Honed Polish' },
      'KB-22-50P': { size: '2x2', thickness: '50mm', finish: 'polish', name: '2x2 Mirror Polish Luxury' },
      'KB-33-30R': { size: '3x3', thickness: '30mm', finish: 'rough', name: '3x3 Grand Format Rough' },
      'KB-33-40P': { size: '3x3', thickness: '40mm', finish: 'polish', name: '3x3 Premium Stepping Slab' },
      'KB-33-50R': { size: '3x3', thickness: '50mm', finish: 'rough', name: '3x3 Heavy 50mm Block Slab' }
    };

    const kbMatch = text.match(/\b(KB-[23]{2}-[345]0[RP])\b/i);
    if (kbMatch) {
      const codeKey = kbMatch[1].toUpperCase();
      if (kbCodeMap[codeKey]) {
        size = kbCodeMap[codeKey].size;
        thickness = kbCodeMap[codeKey].thickness;
        finish = kbCodeMap[codeKey].finish;
        stoneItemName = kbCodeMap[codeKey].name;
      }
      text = text.replace(kbMatch[0], ' ');
    }

    // Check for catalog item code (e.g. ST-01, ST01, ST-1, ST1)
    const catalogCodeRegex = /\b(?:ST[-_]?([0-9]{1,2}))\b/i;
    const catalogCodeMatch = text.match(catalogCodeRegex);
    if (catalogCodeMatch) {
      const codeNum = catalogCodeMatch[1].padStart(2, '0');
      const itemCode = `ST-${codeNum}`;
      try {
        catalogItem = await StoneCatalog.findOne({ code: itemCode });
      } catch {
        catalogItem = null;
      }
      if (catalogItem) {
        stoneItemName = catalogItem.name;
        if (catalogItem.availableSizes?.length > 0) size = catalogItem.availableSizes[0];
        if (catalogItem.availableThicknesses?.length > 0) thickness = catalogItem.availableThicknesses[0];
        text = text.replace(catalogCodeMatch[0], ' ');
      }
    }

    // Extract size: supports 2x2, 2*2, 2 x 2, 5*5, 3 by 3, 2.5x2.5 etc.
    const sizeRegex = /\b([1-9][0-9]*(?:\.[0-9]+)?)\s*(?:[xX*]|by)\s*([1-9][0-9]*(?:\.[0-9]+)?)\b/i;
    const sizeMatch = text.match(sizeRegex);
    if (sizeMatch) {
      size = `${sizeMatch[1]}x${sizeMatch[2]}`.toLowerCase();
      text = text.replace(sizeRegex, ' ');
    }

    // Extract thickness: 20mm, 25mm, 30mm, 35mm, 40mm, 45mm, 50mm, 60mm
    const thickRegex = /\b(20|25|30|35|40|45|50|60)\s*mm\b/i;
    const thickGeneralRegex = /\b(20|25|30|35|40|45|50|60)\b/i;
    const thickMatch = text.match(thickRegex) || text.match(thickGeneralRegex);
    if (thickMatch) {
      thickness = `${thickMatch[1]}mm`;
      text = text.replace(thickMatch[0], ' ');
    }

    // Extract finish: polish / rough
    if (/\b(?:polish|polished)\b/i.test(text)) {
      finish = 'polish';
      text = text.replace(/\b(?:polish|polished)\b/i, ' ');
    } else if (/\b(?:rough|unpolish|unpolished)\b/i.test(text)) {
      finish = 'rough';
      text = text.replace(/\b(?:rough|unpolish|unpolished)\b/i, ' ');
    }

    // Strip out known district names so they don't get misidentified as pieces
    const districts = ['Palakkad', 'Wayanad', 'Kannur', 'Thrissur', 'Ernakulam', 'Kottayam', 'Kozhikode', 'Malappuram'];
    for (const d of districts) {
      text = text.replace(new RegExp(`\\b${d}\\b`, 'ig'), ' ');
    }

    // Extract pieces / quantity
    const pcsRegex = /\b([0-9]{1,6})\s*(?:pcs|pieces|nos|slabs|stones|pkts)\b/i;
    const pcsMatch = text.match(pcsRegex);
    if (pcsMatch) {
      pieces = parseInt(pcsMatch[1], 10);
      text = text.replace(pcsMatch[0], ' ');
    } else {
      const anyNumMatch = text.match(/\b([0-9]{1,6})\b/);
      if (anyNumMatch) {
        pieces = parseInt(anyNumMatch[1], 10);
        text = text.replace(anyNumMatch[0], ' ');
      }
    }

    if (!pieces || pieces <= 0) {
      return null;
    }

    const sqftPerPiece = this.calculateSqftPerPiece(size);
    const lineSqft = pieces * sqftPerPiece;

    // Rate lookup in DistrictRate
    let rateDoc = null;
    try {
      rateDoc = await DistrictRate.findOne({
        district: new RegExp(`^${district}$`, 'i'),
        size: new RegExp(`^${size}$`, 'i'),
        thickness: new RegExp(`^${thickness}$`, 'i'),
        finish: new RegExp(`^${finish}$`, 'i')
      });
      if (!rateDoc) {
        rateDoc = await DistrictRate.findOne({
          district: new RegExp(`^${district}$`, 'i'),
          size: new RegExp(`^${size}$`, 'i'),
          thickness: new RegExp(`^${thickness}$`, 'i')
        });
      }
    } catch {
      rateDoc = null;
    }

    let ratePerSqft = 40;
    if (rateDoc) {
      ratePerSqft = rateDoc.ratePerSqft;
    } else if (catalogItem?.baseRatePerSqft) {
      ratePerSqft = catalogItem.baseRatePerSqft;
    } else if (size === '2x2' && thickness === '30mm') {
      ratePerSqft = 38;
    } else if (size === '3x3' && thickness === '30mm') {
      ratePerSqft = 40;
    }

    const lineTotal = lineSqft * ratePerSqft;

    return {
      size,
      thickness,
      finish,
      pieces,
      sqftPerPiece,
      lineSqft,
      ratePerSqft,
      lineTotal,
      stoneItemName
    };
  },

  /**
   * Command: ORDER <size> <thickness> <qty> [district] (supports multi-line / multi-item orders)
   */
  async handleOrderCommand({ commandText, buyer, senderPhone, pushname }) {
    // 1. Resolve Delivery District
    let district = buyer?.district || 'Palakkad';
    const districts = ['Palakkad', 'Wayanad', 'Kannur', 'Thrissur', 'Ernakulam', 'Kottayam', 'Kozhikode', 'Malappuram'];
    for (const d of districts) {
      const dRegex = new RegExp(`\\b${d}\\b`, 'i');
      if (dRegex.test(commandText)) {
        district = d;
        break;
      }
    }

    // 2. Split into candidate order lines
    const rawItems = this.splitOrderItems(commandText);

    // 3. Parse each candidate item
    const parsedItems = [];
    for (const raw of rawItems) {
      const parsed = await this.parseSingleOrderLine(raw, district);
      if (parsed) {
        parsedItems.push(parsed);
      }
    }

    if (parsedItems.length === 0) {
      return (
`⚠️ *Could not identify stone details or quantity.*

Please specify size, thickness, and pieces count:
👉 *ORDER 2x2 30mm 150 pcs*

💡 *You can also order multiple items at once:*
ORDER 2*2 30mm 150 pcs
ORDER 2*2 30mm 234 pcs
ORDER 5*5 30mm 15 pcs

Reply *CATALOG* to view stone varieties with photos!`
      );
    }

    // 4. Calculate Totals
    const totalPieces = parsedItems.reduce((sum, item) => sum + item.pieces, 0);
    const totalSqft = parsedItems.reduce((sum, item) => sum + item.lineSqft, 0);
    const grandTotal = parsedItems.reduce((sum, item) => sum + item.lineTotal, 0);

    // 5. Determine or create buyer profile
    let buyerId = buyer?.id;
    let buyerDisplayName = buyer?.name || pushname || `Buyer (${senderPhone.slice(-4)})`;

    if (!buyerId) {
      buyerId = `up-wa-${Date.now()}`;
      try {
        const newUnloadingParty = new UnloadingParty({
          id: buyerId,
          name: buyerDisplayName,
          phone: senderPhone,
          district: district,
          totalOrdered: grandTotal,
          paid: 0,
          pending: grandTotal
        });
        await newUnloadingParty.save();
      } catch (saveErr) {
        console.warn('[WhatsApp Bot] Could not auto-create UnloadingParty doc:', saveErr.message);
      }
    } else {
      try {
        await UnloadingParty.findOneAndUpdate(
          { id: buyerId },
          {
            $inc: {
              totalOrdered: grandTotal,
              pending: grandTotal
            }
          }
        );
      } catch (updateErr) {
        console.warn('[WhatsApp Bot] Could not update UnloadingParty balance:', updateErr.message);
      }
    }

    // 6. Build Order Lines for MongoDB Order model
    const orderLines = parsedItems.map((item, idx) => ({
      id: `line-${Date.now()}-${idx + 1}`,
      size: item.size,
      thickness: item.thickness,
      finish: item.finish,
      sqftPerPiece: item.sqftPerPiece,
      pieces: item.pieces,
      ratePerSqft: item.ratePerSqft
    }));

    // 7. Generate and save Order
    const orderCode = `ORD-${new Date().getFullYear().toString().slice(-2)}${String(Date.now()).slice(-5)}`;
    const newOrder = new Order({
      id: `ord-${Date.now()}`,
      code: orderCode,
      unloadingPartyId: buyerId,
      district: district,
      status: 'placed',
      placedAt: new Date().toISOString().slice(0, 10),
      lines: orderLines,
      amountPaid: 0
    });

    await newOrder.save();

    // 8. Trigger Real-time Dashboard Notification & WhatsApp Alert to Owner
    try {
      const { notifyOwnerOfNewOrder } = await import('./orderNotification.service.js');
      await notifyOwnerOfNewOrder(newOrder, buyer || { name: buyerDisplayName, phone: senderPhone, district });
    } catch (notifErr) {
      console.warn('[WhatsApp Bot] Notification creation error:', notifErr.message);
    }

    console.log(`[WhatsApp Bot] New order ${orderCode} created successfully with ${orderLines.length} item(s) for ${buyerDisplayName}!`);

    // 9. Format Stone Breakdown Message
    let itemsBreakdown = '';
    if (parsedItems.length === 1) {
      const item = parsedItems[0];
      const finishFormatted = item.finish ? (item.finish.charAt(0).toUpperCase() + item.finish.slice(1)) : 'Rough';
      const namePart = item.stoneItemName ? ` *${item.stoneItemName}*\n` : '';
      itemsBreakdown = 
`${namePart}• *${item.size}* (${item.thickness} ${finishFormatted})
• Quantity: *${item.pieces} pcs* (${item.lineSqft} sq.ft)
• Agreed Rate: *₹${item.ratePerSqft}/sq.ft*
💰 *Estimated Total:* *₹${grandTotal.toLocaleString('en-IN')}*`;
    } else {
      const itemsList = parsedItems.map((item, idx) => {
        const finishFormatted = item.finish ? (item.finish.charAt(0).toUpperCase() + item.finish.slice(1)) : 'Rough';
        const namePart = item.stoneItemName ? ` [${item.stoneItemName}]` : '';
        return `  ${idx + 1}. *${item.size}* (${item.thickness} ${finishFormatted})${namePart}\n     ↳ *${item.pieces} pcs* (${item.lineSqft} sq.ft) @ ₹${item.ratePerSqft}/sq.ft = ₹${item.lineTotal.toLocaleString('en-IN')}`;
      }).join('\n');

      itemsBreakdown = 
`${itemsList}

📊 *Total Load:* *${totalPieces} pcs* (${totalSqft} sq.ft)
💰 *Estimated Total:* *₹${grandTotal.toLocaleString('en-IN')}*`;
    }

    return (
`✅ *ORDER RECEIVED & CONFIRMED!*

Hello *${buyerDisplayName}*, your order has been registered in our system:

📋 *Order Code:* ${orderCode}
📅 *Date:* ${newOrder.placedAt}
🏁 *Delivery District:* ${district}

📦 *Stone Breakdown:*
${itemsBreakdown}

⏳ *Current Status:* *Placed / Pending Dispatch*

Our dispatch supervisor will review lorry availability and assign your trip shortly.
Reply *STATUS* anytime to track this order or *HI* for your account summary.`
    );
  },

  /**
   * Command: STATUS / TRACK
   */
  async generateStatusMessage(buyer, senderPhone, buyerName) {
    let buyerId = buyer?.id;
    let orders = [];

    if (buyerId) {
      orders = await Order.find({ unloadingPartyId: buyerId }).sort({ createdAt: -1 }).limit(3);
    }

    if (!orders || orders.length === 0) {
      return (
`🚚 *ORDER STATUS TRACKER*

Hello *${buyerName}*, no recent active orders found for phone *${senderPhone}*.

💡 *To place a new order:*
Reply: *ORDER 2x2 30mm 150 pcs*

💡 *To check stone rates:*
Reply: *RATES*`
      );
    }

    let orderListText = '';
    for (const [idx, ord] of orders.entries()) {
      const lineSummary = (ord.lines || []).map(l => `${l.size} (${l.pieces} pcs)`).join(', ') || 'Stone consignment';
      const statusBadge = ord.status === 'dispatched' ? '🚛 DISPATCHED' 
        : ord.status === 'delivered' ? '✅ DELIVERED'
        : ord.status === 'confirmed' ? '📋 CONFIRMED'
        : '⏳ PLACED';

      // Check if trip assigned with vehicle and driver
      let tripInfo = '';
      try {
        const trip = await Trip.findOne({ 
          $or: [
            { orderId: ord.id },
            { orderIds: ord.id },
            { 'stops.orderId': ord.id },
            { unloadingPartyId: ord.unloadingPartyId, status: { $ne: 'delivered' } },
            { 'stops.unloadingPartyId': ord.unloadingPartyId, status: { $ne: 'delivered' } }
          ]
        }).sort({ createdAt: -1 });

        if (trip) {
          let lorryPlate = trip.lorryId || 'Assigned';
          const { Lorry } = await import('../models/Lorry.js');
          const lorryDoc = await Lorry.findOne({ id: trip.lorryId });
          if (lorryDoc?.plate) lorryPlate = lorryDoc.plate;

          let driverDetails = '';
          if (trip.driverId) {
            const driverDoc = await User.findOne({ role: 'driver', 'driverProfile.id': trip.driverId }) ||
              await User.findOne({ role: 'driver', _id: mongoose.isValidObjectId(trip.driverId) ? trip.driverId : null });
            if (driverDoc) {
              driverDetails = `\n   👨‍✈️ Driver: *${driverDoc.name}* (${driverDoc.phone || 'Assigned'})`;
            }
          }
          tripInfo = `\n   🚛 Vehicle: *${lorryPlate}*${driverDetails}`;
        }
      } catch {
        tripInfo = '';
      }

      orderListText += `\n${idx + 1}. *Order ${ord.code}*\n   • Status: *${statusBadge}*\n   • Items: ${lineSummary}\n   • District: ${ord.district}${tripInfo}\n   • Date: ${ord.placedAt}`;
    }

    return (
`🚚 *YOUR ORDERS & DISPATCH STATUS*

Hello *${buyerName}*, here is your current status:
${orderListText}

───────────────
_Type *PDF* for your E-Way Bill or *HI* for your account summary._`
    );
  },

  /**
   * Command: PDF / BILL / INVOICE / CHALLAN / EWAY / MANIFEST
   * Dispatches the official generated PDF directly to the user's WhatsApp.
   */
  async handlePdfRequest(buyer, senderPhone, buyerName) {
    const cleanPhone = senderPhone.replace(/[^0-9]/g, '');
    const last10 = cleanPhone.slice(-10);

    // 1. Check if sender is a driver
    const driverUser = await User.findOne({
      role: 'driver',
      $or: [
        { phone: new RegExp(last10 + '$') },
        { phone: senderPhone }
      ]
    }) || await Driver.findOne({
      $or: [
        { phone: new RegExp(last10 + '$') },
        { phone: senderPhone }
      ]
    });

    if (driverUser) {
      const driverId = driverUser.driverProfile?.id || driverUser.id || driverUser._id;
      const trip = await Trip.findOne({
        $or: [
          { driverId: driverId },
          { driverId: String(driverUser._id) },
          { driverId: driverUser.name }
        ],
        status: { $ne: 'delivered' }
      }).sort({ createdAt: -1 });

      if (trip) {
        try {
          const { pdfService } = await import('./pdf.service.js');
          const manifest = await pdfService.generateTripManifestPDF(trip);
          const caption = `🚚 *TRANSIA MASTER TRIP MANIFEST — ${trip.code || trip.id}*\n\nDriver: *${driverUser.name}*\nLorry: *${trip.lorryId || 'Assigned'}*\n\nDownload Link:\n👉 ${manifest.downloadUrl}`;
          await whatsappService.sendDocumentMessage(senderPhone, manifest.publicUrl, manifest.filename, caption);
          return (
`✅ *TRIP MANIFEST SENT!*

Trip: *${trip.code || trip.id}*
File: *${manifest.filename}*

If the document does not download automatically, open directly here:
👉 ${manifest.downloadUrl}`
          );
        } catch (err) {
          console.error('[WhatsApp Bot] Driver Manifest PDF error:', err.message);
          return `⚠️ Error generating manifest: ${err.message}`;
        }
      }
    }

    // 2. Otherwise handle as Buyer E-Way Bill / Delivery Challan
    if (!buyer || !buyer.id) {
      return (
`📄 *DELIVERY CHALLAN & E-WAY BILL*

Hello *${buyerName}*, no registered account found for phone *${senderPhone}*.
Reply *ORDER 2x2 30mm 150 pcs* to place an order, or *STATUS* to check existing consignments.`
      );
    }

    const trip = await Trip.findOne({
      $or: [
        { unloadingPartyId: buyer.id },
        { 'stops.unloadingPartyId': buyer.id },
        { 'stops.buyerPhone': new RegExp(last10 + '$') }
      ]
    }).sort({ createdAt: -1 });

    if (!trip) {
      return (
`📄 *DELIVERY CHALLAN & E-WAY BILL*

Hello *${buyerName}*, no dispatched trip found for your account yet.
Once a lorry and driver are assigned to your order, an official Delivery Challan & E-Way Bill PDF will be generated.

Reply *STATUS* to track order progress or *RATES* to check stone prices.`
      );
    }

    try {
      const { pdfService } = await import('./pdf.service.js');
      const eway = await pdfService.generateBuyerEwayBillPDF(trip, buyer.id);
      const caption = `📄 *OFFICIAL DELIVERY CHALLAN & E-WAY BILL*\nTrip: *${trip.code || trip.id}*\nBuyer: *${buyerName}*\n\nDownload Link:\n👉 ${eway.downloadUrl}`;
      await whatsappService.sendDocumentMessage(senderPhone, eway.publicUrl, eway.filename, caption);

      return (
`✅ *DELIVERY CHALLAN & E-WAY BILL SENT!*

Trip: *${trip.code || trip.id}*
File: *${eway.filename}*

If the document does not download automatically, open directly here:
👉 ${eway.downloadUrl}`
      );
    } catch (err) {
      console.error('[WhatsApp Bot] Buyer E-Way Bill PDF error:', err.message);
      return `⚠️ Unable to generate PDF right now: ${err.message}. Please try again shortly.`;
    }
  }
};
