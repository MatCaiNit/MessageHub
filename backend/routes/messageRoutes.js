import express from 'express';
import {
  sendDeviceMessage,
  deleteMessage,
  recallMessage,
  markAsSeen,
  uploadAttachment,
} from '../controllers/messageController.js';
import { protect } from '../middleware/auth.js';
import { deviceProtect } from '../middleware/deviceAuth.js';
import { validate } from '../middleware/validate.js';
import { upload } from '../middleware/upload.js';
import { sendDeviceMessageRules, messageIdParamRule } from '../validators/messageValidator.js';

const router = express.Router();

router.post('/device', deviceProtect, sendDeviceMessageRules, validate, sendDeviceMessage);

router.use(protect);

router.post('/upload', upload.single('file'), uploadAttachment);

router.delete('/:id', messageIdParamRule, validate, deleteMessage);
router.patch('/:id/recall', messageIdParamRule, validate, recallMessage);
router.patch('/:id/seen', messageIdParamRule, validate, markAsSeen);

export default router;