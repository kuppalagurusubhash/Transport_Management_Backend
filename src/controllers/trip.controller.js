import { Trip } from '../models/Trip.js';

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
    res.status(201).json(newTrip);
  } catch (err) {
    next(err);
  }
};

export const updateTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findOneAndUpdate(
      { id: req.params.id },
      req.body,
      { new: true }
    );
    res.status(200).json(trip);
  } catch (err) {
    next(err);
  }
};
