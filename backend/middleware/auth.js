import jwt from 'jsonwebtoken';

export const protect = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Không có token' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token hết hạn', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ message: 'Token không hợp lệ', code: 'INVALID_TOKEN' });
    }
};