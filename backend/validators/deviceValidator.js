import { body, param } from 'express-validator';

export const registerDeviceRules = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Ten thiet bi phai tu 2 den 50 ky tu'),
];

export const addMemberRules = [
  param('id').isMongoId().withMessage('deviceId khong hop le'),
  body('userId').isMongoId().withMessage('userId khong hop le'),
];

export const deviceIdParamRule = [param('id').isMongoId().withMessage('deviceId khong hop le')];
