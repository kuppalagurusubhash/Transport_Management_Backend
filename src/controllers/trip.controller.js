import { Trip } from '../models/Trip.js';
import { whatsappService } from '../services/whatsapp.service.js';

export const getTrips = async (req, res, next) => {
  try {
    let filter = {};
    if (req.user && req.user.role === 'driver') {
      filter.driverId = req.user.driverRef;
    } else if (req.user && req.user.role === 'buyer') {
      filter.unloadingPartyId = req.user.buyerRef;
    }
    const data = await Trip.find(filter).sort({ date: -1 });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const getTripById = async (req, res, next) => {
  try {
    const data = await Trip.findOne({ id: req.params.id });
    if (!data) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const createTrip = async (req, res, next) => {
  try {
    const tripData = req.body;
    const newTrip = new Trip(tripData);
    await newTrip.save();

    // Trigger driver WhatsApp notification if driver is assigned
    let whatsappResult = null;
    if (newTrip.driverId) {
      try {
        whatsappResult = await whatsappService.sendDriverTripNotification(newTrip);
      } catch (waErr) {
        console.error('[Trip Controller] WhatsApp notification dispatch failed:', waErr.message);
      }
    }

    res.status(201).json({
      ...newTrip.toObject(),
      whatsappNotification: whatsappResult
    });
  } catch (err) {
    next(err);
  }
};

export const updateTrip = async (req, res, next) => {
  try {
    const existingTrip = await Trip.findOne({ id: req.params.id });
    const trip = await Trip.findOneAndUpdate(
      { id: req.params.id },
      req.body,
      { new: true }
    );

    // If driver was newly assigned or changed, dispatch notification
    if (trip && trip.driverId && (!existingTrip || existingTrip.driverId !== trip.driverId)) {
      whatsappService.sendDriverTripNotification(trip).catch(err => {
        console.error('[Trip Controller] WhatsApp notification error on trip update:', err.message);
      });
    }

    res.status(200).json(trip);
  } catch (err) {
    next(err);
  }
};

export const notifyDriverWhatsApp = async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ id: req.params.id });
    if (!trip) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    const result = await whatsappService.sendDriverTripNotification(trip);
    res.status(200).json({
      success: result.success,
      data: result
    });
  } catch (err) {
    next(err);
  }
};

