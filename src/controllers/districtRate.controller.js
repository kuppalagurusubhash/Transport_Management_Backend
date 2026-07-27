import { DistrictRate } from '../models/DistrictRate.js';

export const getDistrictRates = async (req, res, next) => {
  try {
    const data = await DistrictRate.find({});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const updateDistrictRate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { ratePerSqft } = req.body;

    if (ratePerSqft === undefined || typeof ratePerSqft !== 'number') {
      return res.status(400).json({ success: false, message: 'ratePerSqft is required and must be a number' });
    }

    let rate = await DistrictRate.findOneAndUpdate(
      { id },
      { ratePerSqft },
      { new: true }
    );

    if (!rate) {
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        rate = await DistrictRate.findByIdAndUpdate(id, { ratePerSqft }, { new: true });
      }
    }

    if (!rate) {
      return res.status(404).json({ success: false, message: 'District rate not found' });
    }

    res.status(200).json({ success: true, message: 'District rate updated successfully', data: rate });
  } catch (err) {
    next(err);
  }
};

export const createDistrictRate = async (req, res, next) => {
  try {
    const { district, size, thickness, finish, ratePerSqft } = req.body;

    if (!district || !size || !thickness || !finish || ratePerSqft === undefined || typeof ratePerSqft !== 'number') {
      return res.status(400).json({ success: false, message: 'district, size, thickness, finish, and ratePerSqft are required and ratePerSqft must be a number' });
    }

    const id = `dr-${Date.now()}`;

    const newRate = new DistrictRate({
      id,
      district,
      size,
      thickness,
      finish,
      ratePerSqft
    });

    await newRate.save();

    res.status(201).json({ success: true, message: 'District rate created successfully', data: newRate });
  } catch (err) {
    next(err);
  }
};
