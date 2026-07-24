import express from 'express';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// GET /api/users/search?q=abc - tim user theo username (de bat dau conversation moi)
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const users = await User.find({
      username: { $regex: q, $options: 'i' },
      _id: { $ne: req.userId },
    }).limit(10);

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
});

export default router;
