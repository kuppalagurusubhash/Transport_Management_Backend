import { Lorry } from '../models/Lorry.js';

export const getLorries = async (req, res, next) => {
  try {
    const data = await Lorry.find({});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const getLorryById = async (req, res, next) => {
  try {
    const data = await Lorry.findOne({ id: req.params.id });
    if (!data) {
      return res.status(404).json({ message: 'Lorry not found' });
    }
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const createLorry = async (req, res, next) => {
  try {
    const newLorry = new Lorry(req.body);
    await newLorry.save();
    res.status(201).json(newLorry);
  } catch (err) {
    next(err);
  }
};

export const updateLorry = async (req, res, next) => {
  try {
    const updated = await Lorry.findOneAndUpdate(
      { id: req.params.id },
      req.body,
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: 'Lorry not found' });
    }
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
};

export const deleteLorry = async (req, res, next) => {
  try {
    const deleted = await Lorry.findOneAndDelete({ id: req.params.id });
    if (!deleted) {
      return res.status(404).json({ message: 'Lorry not found' });
    }
    res.status(200).json({ success: true, message: 'Lorry deleted' });
  } catch (err) {
    next(err);
  }
};

