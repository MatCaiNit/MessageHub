import { body, param } from 'express-validator';

export const createConversationRules = [
  body('participantId').isMongoId().withMessage('participantId khong hop le'),
];

export const createGroupRules = [
  body('name').trim().notEmpty().withMessage('Ten nhom khong duoc rong').isLength({ max: 100 }).withMessage('Ten nhom toi da 100 ky tu'),
  body('participantIds').isArray({ min: 1 }).withMessage('Can it nhat 1 thanh vien khac ngoai ban'),
  body('participantIds.*').isMongoId().withMessage('participantIds chua ID khong hop le'),
  body('isPublic').optional().isBoolean().withMessage('isPublic phai la true/false'),
];

export const conversationIdParamRule = [param('id').isMongoId().withMessage('conversationId khong hop le')];

export const addMemberRules = [
  param('id').isMongoId().withMessage('conversationId khong hop le'),
  body('userId').isMongoId().withMessage('userId khong hop le'),
];

export const kickMemberParamRules = [
  param('id').isMongoId().withMessage('conversationId khong hop le'),
  param('userId').isMongoId().withMessage('userId khong hop le'),
];

export const updateGroupInfoRules = [
  param('id').isMongoId().withMessage('conversationId khong hop le'),
  body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Ten nhom phai tu 1-100 ky tu'),
  body('avatar').optional().isString(),
  body('isPublic').optional().isBoolean().withMessage('isPublic phai la true/false'),
];