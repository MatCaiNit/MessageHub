import express from 'express';
import {
  getConversations,
  createConversation,
  getMessages,
} from '../controllers/conversationController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect); // tat ca route ben duoi deu yeu cau dang nhap

router.get('/', getConversations);
router.post('/', createConversation);
router.get('/:id/messages', getMessages);

export default router;
