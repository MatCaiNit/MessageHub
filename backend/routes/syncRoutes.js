import express from 'express';
import { syncData } from '../controllers/syncController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', syncData);

export default router;
