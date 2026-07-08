import crypto from 'crypto';

export const generateApiKey = () => {
    const rawKey = 'dvk_' + crypto.randomBytes(32).toString('hex');
    const keyHash = hashApiKey(rawKey);
    return { rawKey, keyHash };
}

export const hashApiKey = (apiKey) => {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
}