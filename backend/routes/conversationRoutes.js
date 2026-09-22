import express from 'express';
import {
  getConversations,
  createConversation,
  createGroup,
  joinGroup,
  addMember,
  leaveGroup,
  kickMember,
  updateGroupInfo,
  getGroupMembers,
  getMessages,
  getConversationMedia,
} from '../controllers/conversationController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createConversationRules,
  createGroupRules,
  conversationIdParamRule,
  addMemberRules,
  kickMemberParamRules,
  updateGroupInfoRules,
} from '../validators/conversationValidator.js';

const router = express.Router();

router.use(protect); // tat ca route ben duoi deu yeu cau dang nhap

router.get('/', getConversations);
router.post('/', createConversationRules, validate, createConversation);

router.post('/group', createGroupRules, validate, createGroup);
router.post('/:id/join', conversationIdParamRule, validate, joinGroup);
router.post('/:id/leave', conversationIdParamRule, validate, leaveGroup);
router.post('/:id/members', addMemberRules, validate, addMember);
router.get('/:id/members', conversationIdParamRule, validate, getGroupMembers);
router.delete('/:id/members/:userId', kickMemberParamRules, validate, kickMember);
router.patch('/:id', updateGroupInfoRules, validate, updateGroupInfo);

router.get('/:id/messages', conversationIdParamRule, validate, getMessages);
router.get('/:id/media', conversationIdParamRule, validate, getConversationMedia);

export default router;