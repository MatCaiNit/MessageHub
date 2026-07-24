import { body } from 'express-validator';

export const registerRules = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 20 })
        .withMessage('Username phải có độ dài từ 3 đến 20 ký tự')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username chỉ được chứa chữ cái và số và dấu gạch dưới'),
    
    body('email').trim().isEmail().withMessage('Email không hợp lệ').normalizeEmail(),

    body('password')
        .isLength({ min: 6 })
        .withMessage('Mật khẩu phải có ít nhất 6 ký tự')
        .matches(/[A-Z]/)
];

export const loginRules = [
    body('email').trim().isEmail().withMessage('Email không hợp lệ').normalizeEmail(),
    body('password').notEmpty().withMessage('Mật khẩu không được để trống')
];

export const refreshTokenRules = [
    body('refreshToken').notEmpty().withMessage('Refresh token không được để trống')
];