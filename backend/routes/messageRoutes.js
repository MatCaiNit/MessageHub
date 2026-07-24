import express from 'express';
import {
  sendDeviceMessage,
  deleteMessage,
  recallMessage,
  markAsSeen,
} from '../controllers/messageController.js';
import { protect } from '../middleware/auth.js';
import { deviceProtect } from '../middleware/deviceAuth.js';
import { validate } from '../middleware/validate.js';
import { sendDeviceMessageRules, messageIdParamRule } from '../validators/messageValidator.js';

const router = express.Router();

// Route rieng cho THIET BI - xac thuc bang apiKey (X-Device-Key), khong dung JWT
router.post('/device', deviceProtect, sendDeviceMessageRules, validate, sendDeviceMessage);

// Cac route ben duoi danh cho HUMAN - xac thuc bang JWT
router.use(protect);

router.delete('/:id', messageIdParamRule, validate, deleteMessage);
router.patch('/:id/recall', messageIdParamRule, validate, recallMessage);
router.patch('/:id/seen', messageIdParamRule, validate, markAsSeen);

export default router;
