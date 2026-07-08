import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import RefreshToken from '../models/RefreshToken.js';

const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_DAY = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAY || '7', 10);

export const generateAccessToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}

const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export const generateRefreshToken = async (userId) => {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = hashToken(rawToken);

    const expireAt = new Date();
    expireAt.setDate(expireAt.getDate() + REFRESH_TOKEN_EXPIRES_DAY);

    await RefreshToken.create({ userId, tokenHash, expiresAt: expireAt });

    return rawToken;
}

export const verifyRefreshToken = async (rawToken) => {
  const tokenHash = hashToken(rawToken);
  const stored = await RefreshToken.findOne({ tokenHash });
 
  if (!stored) return null;
  if (stored.expiresAt < new Date()) {
    await stored.deleteOne();
    return null;
  }
 
  return stored;
};

export const revokeRefreshToken = async (rawToken) => {
  const tokenHash = hashToken(rawToken);
  await RefreshToken.deleteOne({ tokenHash });
}

export const revokeAllRefreshTokensForUser = async (userId) => {
  await RefreshToken.deleteMany({ userId });
}