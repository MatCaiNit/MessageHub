import { body, param } from 'express-validator';

export const sendDeviceMessageRules = [
  body('content').trim().notEmpty().withMessage('Noi dung tin nhan khong duoc rong'),
  body('type')
    .optional()
    .isIn(['device_event', 'device_telemetry'])
    .withMessage('Type khong hop le'),
];

export const messageIdParamRule = [param('id').isMongoId().withMessage('messageId khong hop le')];
