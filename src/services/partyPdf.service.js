import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ledgerService } from './ledger.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCUMENTS_DIR = path.join(__dirname, '../../public/documents');
const STATEMENTS_DIR = path.join(DOCUMENTS_DIR, 'statements');

if (!fs.existsSync(STATEMENTS_DIR)) {
  fs.mkdirSync(STATEMENTS_DIR, { recursive: true });
}

function formatINR(val) {
  const num = Number(val) || 0;
  return 'Rs. ' + num.toLocaleString('en-IN');
}

export const partyPdfService = {
  /**
   * Generates a professional Party-Wise Financial Statement PDF.
   * Works for both Suppliers (Loading Party/Quarry) and Customers (Unloading Party/Kerala Buyer).
   */
  async generateStatementPDF(partyId, options = {}) {
    const data = await ledgerService.getLedger(partyId, options);
    const { party, period, summary, transactions } = data;
    const isSupplier = party.role === 'supplier';

    const safeName = (party.name || partyId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Statement_${isSupplier ? 'Supplier' : 'Customer'}_${safeName}_${Date.now()}.pdf`;
    const filePath = path.join(STATEMENTS_DIR, filename);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 30, size: 'A4', bufferPages: true });
      const stream = fs.createWriteStream(filePath);
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.pipe(stream);

      // --- HEADER ---
      doc.rect(30, 30, 535, 62).fill('#0F172A');
      doc.fillColor('#F8FAFC').fontSize(15).font('Helvetica-Bold')
        .text('KADAPA STONE TRANSPORT & LOGISTICS', 45, 42);
      doc.fontSize(8.5).font('Helvetica').fillColor('#94A3B8')
        .text('Quarry Direct Natural Kadapa Black Stone Transit | Inter-State Fleet Network | Andhra - Kerala', 45, 59);
      doc.fontSize(8).fillColor('#CBD5E1')
        .text('Depot: Ramapuram, Kadapa Dist, AP | Helpline: +91 7732000110 | GSTIN: 37AAEFK2941Q1ZU', 45, 72);

      // --- STATEMENT TITLE BADGE ---
      const badgeY = 98;
      const badgeColor = isSupplier ? '#854D0E' : '#1E40AF';
      const badgeBg = isSupplier ? '#FEF9C3' : '#EFF6FF';
      doc.rect(30, badgeY, 535, 24).fill(badgeBg).stroke(isSupplier ? '#FDE047' : '#BFDBFE');
      doc.fillColor(badgeColor).fontSize(10.5).font('Helvetica-Bold')
        .text(
          isSupplier ? 'OFFICIAL SUPPLIER / QUARRY PURCHASE STATEMENT' : 'OFFICIAL CUSTOMER / BUYER SALES & RECEIVABLES STATEMENT',
          40, badgeY + 6
        );
      doc.fillColor('#475569').fontSize(8.5).font('Helvetica')
        .text(`Period: ${period.startDate} to ${period.endDate}`, 350, badgeY + 7, { align: 'right', width: 205 });

      // --- PARTY INFO & KPI SUMMARY ---
      let y = 130;
      doc.rect(30, y, 260, 78).fill('#F8FAFC').stroke('#E2E8F0');
      doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold')
        .text(isSupplier ? 'SUPPLIER / QUARRY ACCOUNT DETAILS' : 'CUSTOMER / BUYER ACCOUNT DETAILS', 40, y + 8);
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
      doc.text(`Party Name: ${party.name}`, 40, y + 24);
      doc.text(`Party ID: ${party.id}`, 40, y + 36);
      doc.text(isSupplier ? `Quarry Location: ${party.location || 'Ramapuram'}` : `Destination District: ${party.district || 'Kerala'}`, 40, y + 48);
      doc.text(`Phone: ${party.phone || 'N/A'}`, 40, y + 60);

      // KPI box
      doc.rect(300, y, 265, 78).fill('#F1F5F9').stroke('#CBD5E1');
      doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold')
        .text('ACCOUNT FINANCIAL SUMMARY', 310, y + 8);

      doc.font('Helvetica').fontSize(8).fillColor('#475569');
      doc.text('Opening Balance:', 310, y + 24);
      doc.font('Helvetica-Bold').fillColor('#0F172A').text(formatINR(summary.openingBalance), 460, y + 24, { align: 'right', width: 95 });

      doc.font('Helvetica').fillColor('#475569').text(isSupplier ? 'Total Purchases:' : 'Total Invoiced:', 310, y + 36);
      doc.font('Helvetica-Bold').fillColor('#0F172A').text(formatINR(isSupplier ? summary.totalPurchases : summary.totalInvoiced), 460, y + 36, { align: 'right', width: 95 });

      doc.font('Helvetica').fillColor('#475569').text(isSupplier ? 'Total Payments Paid:' : 'Total Payments Received:', 310, y + 48);
      doc.font('Helvetica-Bold').fillColor('#16A34A').text(formatINR(isSupplier ? summary.totalPaid : summary.totalReceived), 460, y + 48, { align: 'right', width: 95 });

      doc.font('Helvetica-Bold').fillColor('#B91C1C').text('Closing Outstanding Due:', 310, y + 62);
      doc.fontSize(9.5).text(formatINR(summary.closingBalance), 450, y + 61, { align: 'right', width: 105 });

      // --- TRANSACTIONS TABLE HEADER ---
      y = 218;
      const drawTableHeader = (currY) => {
        doc.rect(30, currY, 535, 20).fill('#1E293B');
        doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold');
        doc.text('DATE', 35, currY + 6, { width: 50 });
        doc.text('TRIP / REF', 88, currY + 6, { width: 62 });
        doc.text('LORRY', 152, currY + 6, { width: 55 });
        doc.text(isSupplier ? 'STONE ITEM / QUARRY' : 'STONE ITEM / DESTINATION', 210, currY + 6, { width: 125 });
        doc.text('PIECES', 338, currY + 6, { width: 38, align: 'right' });
        doc.text(isSupplier ? 'PURCHASE' : 'INVOICE', 380, currY + 6, { width: 55, align: 'right' });
        doc.text(isSupplier ? 'PAID' : 'RECEIVED', 440, currY + 6, { width: 55, align: 'right' });
        doc.text('BALANCE', 500, currY + 6, { width: 58, align: 'right' });
      };

      drawTableHeader(y);
      y += 22;

      // --- TABLE ROWS ---
      let rowIndex = 0;
      for (const t of transactions) {
        if (y > 760) {
          doc.addPage();
          y = 35;
          drawTableHeader(y);
          y += 22;
        }

        const bg = rowIndex % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        doc.rect(30, y, 535, 18).fill(bg);

        doc.fillColor('#334155').fontSize(7.5).font('Helvetica');
        doc.text(t.date || '', 35, y + 5, { width: 50 });
        doc.text(t.tripCode || t.reference || '-', 88, y + 5, { width: 62 });
        doc.text(t.lorryPlate || '-', 152, y + 5, { width: 55 });

        const desc = (t.stoneItem || '-').slice(0, 32);
        doc.text(desc, 210, y + 5, { width: 125 });
        doc.text(String(t.pieces || 0), 338, y + 5, { width: 38, align: 'right' });

        const mainAmount = isSupplier ? t.purchaseAmount : t.invoiceAmount;
        doc.text(formatINR(mainAmount), 380, y + 5, { width: 55, align: 'right' });

        const paidAmt = isSupplier ? t.paidAmount : t.amountReceived;
        doc.fillColor(paidAmt > 0 ? '#16A34A' : '#64748B')
          .text(formatINR(paidAmt), 440, y + 5, { width: 55, align: 'right' });

        const bal = t.balance !== undefined ? t.balance : (t.runningBalance || 0);
        doc.fillColor(bal > 0 ? '#DC2626' : '#16A34A').font('Helvetica-Bold')
          .text(formatINR(bal), 500, y + 5, { width: 58, align: 'right' });

        y += 18;
        rowIndex++;
      }

      // --- CLOSING BALANCE BAR ---
      if (y > 740) {
        doc.addPage();
        y = 40;
      } else {
        y += 8;
      }

      doc.rect(30, y, 535, 26).fill('#FEF2F2').stroke('#FCA5A5');
      doc.fillColor('#991B1B').fontSize(9).font('Helvetica-Bold')
        .text('TOTAL CLOSING OUTSTANDING BALANCE DUE:', 40, y + 8);
      doc.fontSize(10.5).text(formatINR(summary.closingBalance), 400, y + 7, { align: 'right', width: 155 });

      y += 36;

      // --- SIGNATURE AND FOOTER ---
      if (y > 750) {
        doc.addPage();
        y = 40;
      }

      doc.rect(30, y, 260, 42).fill('#F8FAFC').stroke('#E2E8F0');
      doc.fillColor('#475569').fontSize(7.5).font('Helvetica')
        .text('Generated By: System / TransIA ERP Authoritative Ledger', 38, y + 8);
      doc.text(`Generated On: ${new Date().toLocaleString('en-IN')}`, 38, y + 18);
      doc.text('This is an authenticated computer generated financial statement.', 38, y + 28);

      doc.rect(305, y, 260, 42).fill('#F8FAFC').stroke('#E2E8F0');
      doc.fillColor('#475569').fontSize(7.5).font('Helvetica')
        .text('For Kadapa Stone Transport & Logistics', 315, y + 8);
      doc.text('Authorized Signatory / Account Manager', 315, y + 28);

      // Add page numbering to all pages
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica')
          .text(
            `Page ${i + 1} of ${totalPages} | Kadapa Stone Transport Financial Ledger Statement | Helpline +91 7732000110`,
            30, 810, { align: 'center', width: 535 }
          );
      }

      doc.end();

      stream.on('finish', () => {
        resolve({
          filename,
          filePath,
          buffer: Buffer.concat(chunks)
        });
      });
      stream.on('error', reject);
    });
  }
};
