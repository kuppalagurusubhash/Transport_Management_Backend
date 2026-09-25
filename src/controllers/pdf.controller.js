import { pdfService } from '../services/pdf.service.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { Trip } from '../models/Trip.js';
import fs from 'fs';

export const getTripManifestPDF = async (req, res, next) => {
  try {
    const { id } = req.params;
    const manifest = await pdfService.generateTripManifestPDF(id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${manifest.filename}"`);
    res.send(manifest.buffer);
  } catch (err) {
    next(err);
  }
};

export const downloadTripManifestPDF = async (req, res, next) => {
  try {
    const { id } = req.params;
    const manifest = await pdfService.generateTripManifestPDF(id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${manifest.filename}"`);
    res.send(manifest.buffer);
  } catch (err) {
    next(err);
  }
};

export const getBuyerEwayBillPDF = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const stopParam = req.query.stop || req.query.buyerId || req.query.orderId;
    const ewayBill = await pdfService.generateBuyerEwayBillPDF(tripId, stopParam);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${ewayBill.filename}"`);
    res.send(ewayBill.buffer);
  } catch (err) {
    next(err);
  }
};

export const downloadBuyerEwayBillPDF = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const stopParam = req.query.stop || req.query.buyerId || req.query.orderId;
    const ewayBill = await pdfService.generateBuyerEwayBillPDF(tripId, stopParam);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${ewayBill.filename}"`);
    res.send(ewayBill.buffer);
  } catch (err) {
    next(err);
  }
};

export const sendTripManifestToDriverWhatsApp = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await whatsappService.sendTripManifestToDriver(id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const sendBuyerEwayBillToWhatsApp = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const stopParam = req.query.stop || req.query.buyerId || req.body?.stop || req.body?.buyerId;
    const result = await whatsappService.sendBuyerEwayBillPDF(tripId, stopParam);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
