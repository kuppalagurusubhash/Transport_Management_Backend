import { StoneRate } from '../models/StoneRate.js';

export const getStoneRates = async (req, res, next) => {
  try {
    const data = await StoneRate.find({});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const updateStoneRate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { ratePerSqft } = req.body;

    if (ratePerSqft === undefined || typeof ratePerSqft !== 'number') {
      return res.status(400).json({ success: false, message: 'ratePerSqft is required and must be a number' });
    }

    let rate = await StoneRate.findOneAndUpdate(
      { id },
      { ratePerSqft },
      { new: true }
    );

    if (!rate) {
      // Try by MongoDB _id
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        rate = await StoneRate.findByIdAndUpdate(id, { ratePerSqft }, { new: true });
      }
    }

    if (!rate) {
      return res.status(404).json({ success: false, message: 'Stone rate specification not found' });
    }

    res.status(200).json({ success: true, message: 'Stone rate updated successfully', data: rate });
  } catch (err) {
    next(err);
  }
};

export const createStoneRate = async (req, res, next) => {
  try {
    const { size, thickness, finish, ratePerSqft } = req.body;

    if (!size || !thickness || !finish || ratePerSqft === undefined || typeof ratePerSqft !== 'number') {
      return res.status(400).json({ success: false, message: 'size, thickness, finish, and ratePerSqft are required and ratePerSqft must be a number' });
    }

    const id = `sp-${Date.now()}`;

    const newRate = new StoneRate({
      id,
      size,
      thickness,
      finish,
      ratePerSqft
    });

    await newRate.save();

    res.status(201).json({ success: true, message: 'Stone rate created successfully', data: newRate });
  } catch (err) {
    next(err);
  }
};
