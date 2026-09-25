import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Trip } from '../models/Trip.js';
import { Order } from '../models/Order.js';
import { User } from '../models/User.js';
import { UnloadingParty } from '../models/UnloadingParty.js';
import { Lorry } from '../models/Lorry.js';
import { Driver } from '../models/Driver.js';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCUMENTS_DIR = path.join(__dirname, '../../public/documents');
const MANIFESTS_DIR = path.join(DOCUMENTS_DIR, 'manifests');
const EWAY_BILLS_DIR = path.join(DOCUMENTS_DIR, 'eway_bills');

// Ensure storage directories exist
[DOCUMENTS_DIR, MANIFESTS_DIR, EWAY_BILLS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * PDF Service for generating Master Trip Manifests and Buyer E-Way Bills / Delivery Challans.
 */
export const pdfService = {
  /**
   * Generates Master Trip Manifest PDF for the entire lorry trip (multi-stop or single stop).
   * @param {string|Object} tripOrId 
   */
  async generateTripManifestPDF(tripOrId) {
    let trip = tripOrId;
    if (typeof tripOrId === 'string') {
      trip = await Trip.findOne({ id: tripOrId });
    }
    if (!trip) throw new Error('Trip not found');

    // Look up Driver
    let driver = trip.driver || null;
    if (!driver && trip.driverId && mongoose.connection.readyState === 1) {
      driver = await User.findOne({
        role: 'driver',
        $or: [
          { 'driverProfile.id': trip.driverId },
          { _id: mongoose.isValidObjectId(trip.driverId) ? trip.driverId : null },
          { username: trip.driverId }
        ].filter(Boolean)
      }) || await Driver.findOne({ id: trip.driverId });
    }

    // Look up Lorry
    let lorry = trip.lorry || null;
    if (!lorry && trip.lorryId && mongoose.connection.readyState === 1) {
      lorry = await Lorry.findOne({
        $or: [
          { id: trip.lorryId },
          { _id: mongoose.isValidObjectId(trip.lorryId) ? trip.lorryId : null }
        ].filter(Boolean)
      });
    }

    const driverName = driver?.name || 'Assigned Driver';
    const driverPhone = driver?.phone || 'N/A';
    const lorryPlate = lorry?.plate || trip.lorryId || 'Assigned Lorry';
    const tripCode = trip.code || trip.id || 'TRIP';
    const date = trip.date || new Date().toISOString().slice(0, 10);
    const origin = trip.origin || 'Kalliyath Quarry Loading Yard, Palakkad';

    const filename = `Manifest_${tripCode.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    const filePath = path.join(MANIFESTS_DIR, filename);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 35, size: 'A4' });
      const stream = fs.createWriteStream(filePath);
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.pipe(stream);

      // --- 1. HEADER & BRANDING ---
      doc.rect(35, 35, 525, 60).fill('#1B365D');
      doc.fillColor('#FFFFFF').fontSize(16).font('Helvetica-Bold')
        .text('TRANSIA STONE LOGISTICS & FLEET MANAGEMENT', 50, 48);
      doc.fontSize(9).font('Helvetica')
        .text('Quarry Direct Natural Stone Transit · Multi-Drop Distribution Network · Kerala & South India', 50, 68);
      doc.fontSize(8).text('Helpline: +91 7732000110 | dispatch@transia.in | GST State Code: 32 (Kerala)', 50, 80);

      // --- 2. DOCUMENT TITLE BADGE ---
      doc.moveDown(1.5);
      const titleY = 105;
      doc.rect(35, titleY, 525, 24).fill('#F0FDF4').stroke('#86EFAC');
      doc.fillColor('#166534').fontSize(11).font('Helvetica-Bold')
        .text('MASTER TRIP MANIFEST & DRIVER ROUTE DISPATCH SHEET', 45, titleY + 6);
      doc.fillColor('#15803D').fontSize(9).font('Helvetica')
        .text(`TRIP REF: ${tripCode}`, 420, titleY + 7, { align: 'right', width: 130 });

      // --- 3. METADATA GRID BOX ---
      const metaY = 138;
      doc.rect(35, metaY, 525, 65).fill('#F8FAFC').stroke('#CBD5E1');

      doc.fillColor('#334155').fontSize(9).font('Helvetica-Bold');
      doc.text('Date:', 45, metaY + 10).font('Helvetica').text(date, 95, metaY + 10);
      doc.font('Helvetica-Bold').text('Vehicle Plate:', 45, metaY + 26).font('Helvetica').text(lorryPlate, 115, metaY + 26);
      doc.font('Helvetica-Bold').text('Quarry Origin:', 45, metaY + 42).font('Helvetica').text(origin, 115, metaY + 42, { width: 190 });

      doc.font('Helvetica-Bold').text('Driver Name:', 320, metaY + 10).font('Helvetica').text(driverName, 395, metaY + 10);
      doc.font('Helvetica-Bold').text('Driver Mobile:', 320, metaY + 26).font('Helvetica').text(driverPhone, 395, metaY + 26);
      doc.font('Helvetica-Bold').text('Trip Status:', 320, metaY + 42).font('Helvetica').text(String(trip.status || 'loading').toUpperCase(), 395, metaY + 42);

      // --- 4. MULTI-DROP STOPS ROUTE BREAKDOWN ---
      let currentY = 215;
      const isMultiDrop = Array.isArray(trip.stops) && trip.stops.length > 0;

      if (isMultiDrop) {
        doc.fillColor('#0F172A').fontSize(11).font('Helvetica-Bold')
          .text(`UNLOADING ROUTE & STOP SEQUENCE (${trip.stops.length} STOPS)`, 35, currentY);
        currentY += 16;

        // Table Header
        doc.rect(35, currentY, 525, 20).fill('#E2E8F0');
        doc.fillColor('#1E293B').fontSize(8).font('Helvetica-Bold');
        doc.text('STOP', 40, currentY + 6);
        doc.text('CUSTOMER / RECIPIENT', 75, currentY + 6);
        doc.text('LOCATION / DISTRICT', 215, currentY + 6);
        doc.text('CONTACT', 335, currentY + 6);
        doc.text('LOAD', 415, currentY + 6);
        doc.text('COLLECT (₹)', 480, currentY + 6, { align: 'right', width: 70 });
        currentY += 20;

        let grandStopsPcs = 0;
        let grandStopsExpected = 0;

        trip.stops.forEach((stop, idx) => {
          const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          doc.rect(35, currentY, 525, 24).fill(rowBg).stroke('#E2E8F0');

          const pcs = stop.totalPieces || (stop.stoneLines || []).reduce((s, l) => s + (Number(l.pieces) || 0), 0);
          const expAmt = Number(stop.expectedAmount) || 0;
          grandStopsPcs += pcs;
          grandStopsExpected += expAmt;

          doc.fillColor('#0F172A').fontSize(8).font('Helvetica-Bold');
          doc.text(`#${stop.stopNumber || (idx + 1)}`, 40, currentY + 7);
          doc.font('Helvetica-Bold').text(stop.buyerName || stop.unloadingPartyId || 'Customer', 75, currentY + 7, { width: 135, height: 20 });
          doc.font('Helvetica').text(stop.deliveryLocation || stop.district || 'Unloading Site', 215, currentY + 7, { width: 115, height: 20 });
          doc.text(stop.buyerPhone || 'N/A', 335, currentY + 7);
          doc.font('Helvetica-Bold').text(`${pcs} pcs`, 415, currentY + 7);
          doc.fillColor('#047857').text(`₹${expAmt.toLocaleString('en-IN')}`, 480, currentY + 7, { align: 'right', width: 70 });

          currentY += 24;
        });

        // Stops Subtotal Bar
        doc.rect(35, currentY, 525, 20).fill('#F1F5F9').stroke('#CBD5E1');
        doc.fillColor('#0F172A').fontSize(8).font('Helvetica-Bold');
        doc.text('ROUTE TOTALS:', 40, currentY + 6);
        doc.text(`${grandStopsPcs} Pieces across all stops`, 415, currentY + 6);
        doc.fillColor('#047857').text(`₹${grandStopsExpected.toLocaleString('en-IN')}`, 480, currentY + 6, { align: 'right', width: 70 });
        currentY += 32;
      }

      // --- 5. ITEMIZED STONE CONSIGNMENT LOAD ---
      doc.fillColor('#0F172A').fontSize(11).font('Helvetica-Bold')
        .text('DETAILED STONE CONSIGNMENT LOAD', 35, currentY);
      currentY += 16;

      // Table Header
      doc.rect(35, currentY, 525, 20).fill('#E2E8F0');
      doc.fillColor('#1E293B').fontSize(8).font('Helvetica-Bold');
      doc.text('#', 40, currentY + 6);
      doc.text('SIZE & DESCRIPTION', 65, currentY + 6);
      doc.text('THICKNESS', 195, currentY + 6);
      doc.text('FINISH', 265, currentY + 6);
      doc.text('PCS', 335, currentY + 6);
      doc.text('SQ.FT', 390, currentY + 6);
      doc.text('DESTINATION / STOP', 450, currentY + 6);
      currentY += 20;

      const lines = Array.isArray(trip.stoneLines) && trip.stoneLines.length > 0 ? trip.stoneLines : [];
      let totalLoadPieces = 0;
      let totalLoadSqft = 0;

      if (lines.length === 0) {
        doc.rect(35, currentY, 525, 22).fill('#FFFFFF').stroke('#E2E8F0');
        doc.fillColor('#64748B').fontSize(8).font('Helvetica').text('No stone line details recorded for this trip.', 45, currentY + 7);
        currentY += 22;
      } else {
        lines.forEach((line, idx) => {
          const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          doc.rect(35, currentY, 525, 20).fill(rowBg).stroke('#E2E8F0');

          const pcs = Number(line.pieces) || 0;
          const sqftPerPc = Number(line.sqftPerPiece) || (line.size === '3x3' ? 9 : 4);
          const lineSqft = pcs * sqftPerPc;
          totalLoadPieces += pcs;
          totalLoadSqft += lineSqft;

          const finishStr = line.finish ? (line.finish.charAt(0).toUpperCase() + line.finish.slice(1)) : 'Rough';
          const destStr = line.destination || (line.unloadingPartyId ? line.unloadingPartyId : 'Site');

          doc.fillColor('#0F172A').fontSize(8).font('Helvetica');
          doc.text(String(idx + 1), 40, currentY + 6);
          doc.font('Helvetica-Bold').text(`${line.size} Natural Stone Slab`, 65, currentY + 6);
          doc.font('Helvetica').text(line.thickness || '30mm', 195, currentY + 6);
          doc.text(finishStr, 265, currentY + 6);
          doc.font('Helvetica-Bold').text(String(pcs), 335, currentY + 6);
          doc.font('Helvetica').text(lineSqft.toFixed(1), 390, currentY + 6);
          doc.text(destStr, 450, currentY + 6, { width: 105, height: 14 });

          currentY += 20;
        });

        // Consignment Load Totals
        doc.rect(35, currentY, 525, 22).fill('#F1F5F9').stroke('#CBD5E1');
        doc.fillColor('#0F172A').fontSize(8).font('Helvetica-Bold');
        doc.text('TOTAL CONSIGNMENT LOAD:', 65, currentY + 7);
        doc.text(`${totalLoadPieces} pcs`, 335, currentY + 7);
        doc.text(`${totalLoadSqft.toFixed(1)} sq.ft`, 390, currentY + 7);
        currentY += 32;
      }

      // --- 6. DRIVER TRANSIT & UNLOADING INSTRUCTIONS ---
      if (currentY > 670) {
        doc.addPage();
        currentY = 40;
      }

      doc.rect(35, currentY, 525, 55).fill('#FFFBEB').stroke('#FDE68A');
      doc.fillColor('#92400E').fontSize(9).font('Helvetica-Bold')
        .text('⚠️ MANDATORY DRIVER & UNLOADING INSTRUCTIONS:', 45, currentY + 8);
      doc.fontSize(8).font('Helvetica')
        .text('1. Reverse Sequence Loading: Offload Stop #1 stones first, followed by Stop #2. Do not mix pieces between customers.', 45, currentY + 22)
        .text('2. Payment Collection: Collect cash or verified UPI payments at each respective stop prior to departure.', 45, currentY + 33)
        .text('3. Safe Transit: Verify load tying and stone padding before driving. Call each customer 30 minutes before arrival.', 45, currentY + 44);

      currentY += 70;

      // --- 7. SIGNATURE BLOCK ---
      doc.rect(35, currentY, 250, 50).stroke('#CBD5E1');
      doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold').text('LOADING YARD SUPERVISOR', 45, currentY + 8);
      doc.font('Helvetica').text('Verified count, sizes & dispatch authorization:', 45, currentY + 18);
      doc.text('Signature: _______________________ Date: ________', 45, currentY + 36);

      doc.rect(310, currentY, 250, 50).stroke('#CBD5E1');
      doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold').text('DRIVER ACKNOWLEDGMENT', 320, currentY + 8);
      doc.font('Helvetica').text('I acknowledge receipt of full stone count in sound condition:', 320, currentY + 18);
      doc.text('Signature: _______________________ Date: ________', 320, currentY + 36);

      // Footer
      doc.fontSize(7).fillColor('#94A3B8')
        .text(`Generated on ${new Date().toLocaleString('en-IN')} · Transia Logistics Management System · Official Trip Manifest`, 35, 790, { align: 'center', width: 525 });

      doc.end();

      stream.on('finish', () => {
        const buffer = Buffer.concat(chunks);
        const baseUrl = process.env.API_BASE_URL || process.env.BASE_URL || 'http://localhost:9090';
        const publicUrl = `${baseUrl}/documents/manifests/${filename}`;
        resolve({
          success: true,
          filename,
          filePath,
          publicUrl,
          downloadUrl: `${baseUrl}/api/pdf/trip/${trip.id}/download`,
          sizeBytes: buffer.length,
          buffer
        });
      });

      stream.on('error', err => reject(err));
    });
  },

  /**
   * Generates Government/Tax-compliant E-Way Bill & Delivery Challan PDF for an individual Buyer.
   * @param {string|Object} tripOrId 
   * @param {number|string} stopNumberOrPartyId 
   */
  async generateBuyerEwayBillPDF(tripOrId, stopNumberOrPartyId = null) {
    let trip = tripOrId;
    if (typeof tripOrId === 'string') {
      trip = await Trip.findOne({ id: tripOrId });
    }
    if (!trip) throw new Error('Trip not found');

    // Resolve specific stop or buyer
    let stop = null;
    if (Array.isArray(trip.stops) && trip.stops.length > 0) {
      if (stopNumberOrPartyId !== null && stopNumberOrPartyId !== undefined) {
        stop = trip.stops.find(s => 
          String(s.stopNumber) === String(stopNumberOrPartyId) || 
          s.unloadingPartyId === String(stopNumberOrPartyId) ||
          s.orderId === String(stopNumberOrPartyId)
        ) || trip.stops[0];
      } else {
        stop = trip.stops[0];
      }
    }

    const buyerId = stop?.unloadingPartyId || trip.unloadingPartyId;

    // Look up Buyer
    let buyer = trip.buyer || null;
    if (!buyer && buyerId && mongoose.connection.readyState === 1) {
      buyer = await User.findOne({
        role: 'buyer',
        $or: [
          { 'buyerProfile.id': buyerId },
          { _id: mongoose.isValidObjectId(buyerId) ? buyerId : null },
          { username: buyerId }
        ].filter(Boolean)
      }) || await UnloadingParty.findOne({ id: buyerId });
    }

    // Look up Driver
    let driver = trip.driver || null;
    if (!driver && trip.driverId && mongoose.connection.readyState === 1) {
      driver = await User.findOne({
        role: 'driver',
        $or: [
          { 'driverProfile.id': trip.driverId },
          { _id: mongoose.isValidObjectId(trip.driverId) ? trip.driverId : null },
          { username: trip.driverId }
        ].filter(Boolean)
      }) || await Driver.findOne({ id: trip.driverId });
    }

    // Look up Lorry
    let lorry = trip.lorry || null;
    if (!lorry && trip.lorryId && mongoose.connection.readyState === 1) {
      lorry = await Lorry.findOne({
        $or: [
          { id: trip.lorryId },
          { _id: mongoose.isValidObjectId(trip.lorryId) ? trip.lorryId : null }
        ].filter(Boolean)
      });
    }

    const buyerName = stop?.buyerName || buyer?.name || 'Valued Customer';
    const buyerPhone = stop?.buyerPhone || buyer?.phone || 'N/A';
    const buyerDistrict = stop?.district || buyer?.buyerProfile?.district || buyer?.district || 'Palakkad';
    const deliveryLocation = stop?.deliveryLocation || buyer?.buyerProfile?.location || buyerDistrict;

    const driverName = driver?.name || 'Assigned Driver';
    const driverPhone = driver?.phone || 'N/A';
    const lorryPlate = lorry?.plate || trip.lorryId || 'Assigned Lorry';
    const tripCode = trip.code || trip.id || 'TRIP';
    const date = trip.date || new Date().toISOString().slice(0, 10);
    const origin = trip.origin || 'Kalliyath Quarry Loading Yard, Palakkad';

    const ewayBillNo = `EWB-KL-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const filename = `EwayBill_${tripCode.replace(/[^a-zA-Z0-9_-]/g, '_')}_${buyerName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 15)}.pdf`;
    const filePath = path.join(EWAY_BILLS_DIR, filename);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 35, size: 'A4' });
      const stream = fs.createWriteStream(filePath);
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.pipe(stream);

      // --- 1. OFFICIAL E-WAY BILL HEADER ---
      doc.rect(35, 35, 525, 55).fill('#0F172A');
      doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold')
        .text('KERALA GOODS TRANSPORT DELIVERY CHALLAN & E-WAY BILL', 45, 45);
      doc.fontSize(8).font('Helvetica')
        .text('(Issued under Rule 55 of the CGST / SGST Rules, 2017 for Transportation of Goods to Consignee)', 45, 62);
      doc.fontSize(8).text('Transia Stone Logistics · Government Quarry Transit Pass · Kerala State (Code 32)', 45, 73);

      // --- 2. E-WAY BILL BARCODE / REFERENCE RIBBON ---
      const ribbonY = 96;
      doc.rect(35, ribbonY, 525, 26).fill('#F1F5F9').stroke('#94A3B8');
      doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold')
        .text(`E-WAY BILL NO: ${ewayBillNo}`, 45, ribbonY + 7);
      doc.fontSize(8).font('Helvetica')
        .text(`Dispatch Date: ${date}  |  Valid Until: 48 Hours from Dispatch`, 310, ribbonY + 8, { align: 'right', width: 240 });

      // --- 3. TWO-COLUMN DETAILS: CONSIGNOR & CONSIGNEE ---
      const entityY = 130;
      // Consignor Box (Left)
      doc.rect(35, entityY, 255, 95).stroke('#CBD5E1');
      doc.rect(35, entityY, 255, 20).fill('#E2E8F0');
      doc.fillColor('#1E293B').fontSize(9).font('Helvetica-Bold').text('PART A: CONSIGNOR (SUPPLIER / LOADING YARD)', 45, entityY + 6);

      doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold').text('Transia Logistics & Quarry Direct', 45, entityY + 28);
      doc.fontSize(8).font('Helvetica')
        .text(`Quarry Origin: ${origin}`, 45, entityY + 42, { width: 235 })
        .text('District: Palakkad, Kerala - 678001', 45, entityY + 65)
        .text('Contact: +91 7732000110 / +91 7893310812', 45, entityY + 77);

      // Consignee Box (Right)
      doc.rect(305, entityY, 255, 95).stroke('#CBD5E1');
      doc.rect(305, entityY, 255, 20).fill('#E2E8F0');
      doc.fillColor('#1E293B').fontSize(9).font('Helvetica-Bold').text('PART B: CONSIGNEE (RECIPIENT / BUYER)', 315, entityY + 6);

      doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold').text(buyerName, 315, entityY + 28, { width: 235 });
      doc.fontSize(8).font('Helvetica')
        .text(`Delivery Site: ${deliveryLocation}`, 315, entityY + 42, { width: 235 })
        .text(`Destination District: ${buyerDistrict}, Kerala`, 315, entityY + 65)
        .text(`Buyer Contact Mobile: ${buyerPhone}`, 315, entityY + 77);

      // --- 4. VEHICLE & DRIVER DETAILS (PART C) ---
      const transY = 233;
      doc.rect(35, transY, 525, 45).fill('#F8FAFC').stroke('#CBD5E1');
      doc.fillColor('#1E293B').fontSize(9).font('Helvetica-Bold').text('PART C: TRANSPORT & VEHICLE PARTICULARS', 45, transY + 8);

      doc.fontSize(8).font('Helvetica')
        .text('Vehicle Registration (Lorry):', 45, transY + 24).font('Helvetica-Bold').text(lorryPlate, 160, transY + 24)
        .font('Helvetica').text('Driver Name:', 270, transY + 24).font('Helvetica-Bold').text(driverName, 335, transY + 24)
        .font('Helvetica').text('Driver Contact:', 420, transY + 24).font('Helvetica-Bold').text(driverPhone, 485, transY + 24);

      // --- 5. ITEM CONSIGNMENT TABLE ---
      let currentY = 288;
      const stopNumberSnippet = stop?.stopNumber ? ` (Delivery Stop #${stop.stopNumber})` : '';
      doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold')
        .text(`PART D: CONSIGNMENT STONE DETAILS${stopNumberSnippet}`, 35, currentY);
      currentY += 16;

      // Table Header
      doc.rect(35, currentY, 525, 20).fill('#1E293B');
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      doc.text('S.NO', 40, currentY + 6);
      doc.text('DESCRIPTION OF GOODS (HSN 6802)', 75, currentY + 6);
      doc.text('DIMENSIONS', 255, currentY + 6);
      doc.text('FINISH', 320, currentY + 6);
      doc.text('PIECES', 380, currentY + 6);
      doc.text('SQ.FT', 430, currentY + 6);
      doc.text('AMOUNT (₹)', 485, currentY + 6, { align: 'right', width: 65 });
      currentY += 20;

      // Lines to render: prioritize stop's stone lines
      const lines = (stop && Array.isArray(stop.stoneLines) && stop.stoneLines.length > 0)
        ? stop.stoneLines
        : (Array.isArray(trip.stoneLines) ? trip.stoneLines : []);

      let totalPcs = 0;
      let totalSqft = 0;
      let totalAmount = 0;

      if (lines.length === 0) {
        doc.rect(35, currentY, 525, 22).fill('#FFFFFF').stroke('#E2E8F0');
        doc.fillColor('#64748B').fontSize(8).font('Helvetica').text('Natural Quarry Stone Load - As per consignment verification', 45, currentY + 7);
        currentY += 22;
      } else {
        lines.forEach((line, idx) => {
          const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          doc.rect(35, currentY, 525, 20).fill(rowBg).stroke('#E2E8F0');

          const pcs = Number(line.pieces) || 0;
          const sqftPerPc = Number(line.sqftPerPiece) || (line.size === '3x3' ? 9 : 4);
          const lineSqft = pcs * sqftPerPc;
          const rate = Number(line.ratePerSqft) || (line.size === '3x3' ? 42 : 38);
          const lineTotal = lineSqft * rate;

          totalPcs += pcs;
          totalSqft += lineSqft;
          totalAmount += lineTotal;

          const finishStr = line.finish ? (line.finish.charAt(0).toUpperCase() + line.finish.slice(1)) : 'Rough';

          doc.fillColor('#0F172A').fontSize(8).font('Helvetica');
          doc.text(String(idx + 1), 40, currentY + 6);
          doc.font('Helvetica-Bold').text(`Natural Stone Slabs (${line.thickness || '30mm'})`, 75, currentY + 6);
          doc.font('Helvetica').text(line.size || '2x2', 255, currentY + 6);
          doc.text(finishStr, 320, currentY + 6);
          doc.font('Helvetica-Bold').text(String(pcs), 380, currentY + 6);
          doc.font('Helvetica').text(lineSqft.toFixed(1), 430, currentY + 6);
          doc.font('Helvetica-Bold').text(`₹${Math.round(lineTotal).toLocaleString('en-IN')}`, 485, currentY + 6, { align: 'right', width: 65 });

          currentY += 20;
        });
      }

      // If stop has expectedAmount override
      if (stop?.expectedAmount && stop.expectedAmount > 0) {
        totalAmount = Number(stop.expectedAmount);
      }

      // Consignment Grand Total Row
      doc.rect(35, currentY, 525, 24).fill('#F0FDF4').stroke('#86EFAC');
      doc.fillColor('#166534').fontSize(9).font('Helvetica-Bold');
      doc.text('TOTAL CONSIGNMENT VALUE:', 75, currentY + 8);
      doc.text(`${totalPcs} Pcs`, 380, currentY + 8);
      doc.text(`${totalSqft.toFixed(1)} Sq.Ft`, 430, currentY + 8);
      doc.fontSize(10).text(`₹${Math.round(totalAmount).toLocaleString('en-IN')}`, 480, currentY + 7, { align: 'right', width: 70 });
      currentY += 34;

      // --- 6. FINANCIAL COLLECTION BOX ---
      const finBoxY = currentY;
      doc.rect(35, finBoxY, 525, 45).fill('#EFF6FF').stroke('#93C5FD');
      doc.fillColor('#1E40AF').fontSize(9).font('Helvetica-Bold').text('PAYMENT & COLLECTION SUMMARY FOR THIS CONSIGNMENT', 45, finBoxY + 8);

      const payableAmt = totalAmount;
      doc.fontSize(8).font('Helvetica')
        .text('Total Invoice / Consignment Value:', 45, finBoxY + 24).font('Helvetica-Bold').text(`₹${Math.round(payableAmt).toLocaleString('en-IN')}`, 190, finBoxY + 24)
        .font('Helvetica').text('Payment Mode:', 280, finBoxY + 24).font('Helvetica-Bold').text('Cash to Driver / Direct UPI to Transia', 355, finBoxY + 24)
        .fillColor('#DC2626').text(`Amount Due at Delivery: ₹${Math.round(payableAmt).toLocaleString('en-IN')}`, 45, finBoxY + 34);

      currentY += 55;

      // --- 7. OFFICIAL DECLARATIONS & TERMS ---
      doc.rect(35, currentY, 525, 45).stroke('#CBD5E1');
      doc.fillColor('#475569').fontSize(7.5).font('Helvetica-Bold').text('TERMS OF DELIVERY & RECEIVER DECLARATION:', 45, currentY + 6);
      doc.font('Helvetica').fontSize(7)
        .text('1. We hereby certify that the goods described above are being transported for delivery to the consignee destination specified.', 45, currentY + 16)
        .text('2. Consignee must inspect stone count, sizes, and sound condition upon unloading before releasing the vehicle.', 45, currentY + 25)
        .text('3. Any transit breakage claim exceeding allowable tolerance must be endorsed on this document and reported immediately.', 45, currentY + 34);

      currentY += 55;

      // --- 8. OFFICIAL SIGNATURES ---
      doc.rect(35, currentY, 170, 50).stroke('#CBD5E1');
      doc.fillColor('#334155').fontSize(7.5).font('Helvetica-Bold').text('FOR TRANSIA LOGISTICS', 45, currentY + 7);
      doc.font('Helvetica').text('Authorized Dispatcher', 45, currentY + 18);
      doc.text('Signature: ________________', 45, currentY + 36);

      doc.rect(212, currentY, 170, 50).stroke('#CBD5E1');
      doc.fillColor('#334155').fontSize(7.5).font('Helvetica-Bold').text('TRANSPORTER / DRIVER', 222, currentY + 7);
      doc.font('Helvetica').text(`Driver: ${driverName}`, 222, currentY + 18);
      doc.text('Signature: ________________', 222, currentY + 36);

      doc.rect(390, currentY, 170, 50).stroke('#CBD5E1');
      doc.fillColor('#334155').fontSize(7.5).font('Helvetica-Bold').text('CONSIGNEE ACKNOWLEDGMENT', 400, currentY + 7);
      doc.font('Helvetica').text('Received in Sound Condition:', 400, currentY + 18);
      doc.text('Receiver Stamp / Sign: _____', 400, currentY + 36);

      // Footer
      doc.fontSize(7).fillColor('#94A3B8')
        .text(`Generated on ${new Date().toLocaleString('en-IN')} · Official Kerala Stone Transport Delivery Challan & E-Way Bill`, 35, 795, { align: 'center', width: 525 });

      doc.end();

      stream.on('finish', () => {
        const buffer = Buffer.concat(chunks);
        const baseUrl = process.env.API_BASE_URL || process.env.BASE_URL || 'http://localhost:9090';
        const publicUrl = `${baseUrl}/documents/eway_bills/${filename}`;
        const stopParam = stop?.stopNumber ? `?stop=${stop.stopNumber}` : '';
        resolve({
          success: true,
          filename,
          filePath,
          publicUrl,
          downloadUrl: `${baseUrl}/api/pdf/eway/${trip.id}/download${stopParam}`,
          sizeBytes: buffer.length,
          buffer
        });
      });

      stream.on('error', err => reject(err));
    });
  }
};
