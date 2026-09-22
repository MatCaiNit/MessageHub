import { body, param } from 'express-validator';

export const registerDeviceRules = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Ten thiet bi phai tu 2 den 50 ky tu'),

  // Optional: chi validate neu client co gui conversationId (che do join hub co san)
  body('conversationId')
    .optional()
    .isMongoId()
    .withMessage('conversationId khong hop le'),
];

export const addMemberRules = [
  param('id').isMongoId().withMessage('deviceId khong hop le'),
  body('userId').isMongoId().withMessage('userId khong hop le'),
];

export const deviceIdParamRule = [param('id').isMongoId().withMessage('deviceId khong hop le')];