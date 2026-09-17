import crypto from 'crypto';
import { User } from '../models/User.js';

export function createAuthService({ token, sessionSecret }) {
    const sessions = new Map();
    const cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [sessionToken, session] of sessions) {
            if (session.expiresAt <= now) sessions.delete(sessionToken);
        }
    }, 60_000);
    cleanupTimer.unref?.();

    async function getUserAuthContext(tgId) {
        const user = await User.findOne({ tg_id: Number(tgId) }).populate('group_ids').lean();
        if (!user) return { isAdmin: false, isMentor: false, groups: [], user };
        const groups = user.group_ids || [];
        return {
            isAdmin: user.role === 'admin',
            isMentor: user.role === 'mentor',
            groups,
            user
        };
    }

    function validateTelegramInitData(initData) {
        const params = new URLSearchParams(initData || '');
        const receivedHash = params.get('hash');
        const authDate = Number(params.get('auth_date'));
        if (!/^[a-f0-9]{64}$/i.test(receivedHash) || !authDate || Date.now() / 1000 - authDate > 3600) return null;

        params.delete('hash');
        const dataCheckString = [...params.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
        const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        if (receivedHash.length !== expectedHash.length || !crypto.timingSafeEqual(Buffer.from(receivedHash, 'hex'), Buffer.from(expectedHash, 'hex'))) return null;

        try {
            const user = JSON.parse(params.get('user') || '{}');
            return Number.isSafeInteger(user.id) ? user : null;
        } catch {
            return null;
        }
    }

    function createSession(userId, telegramUser = {}) {
        const expiresAt = Date.now() + 5 * 60 * 1000;
        const payload = `${userId}.${expiresAt}`;
        const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
        const tokenValue = `${payload}.${signature}`;
        sessions.set(tokenValue, { userId, username: telegramUser.username || '', expiresAt });
        return { token: tokenValue, expiresAt };
    }

    async function requireSession(req, res, next) {
        const tokenValue = req.headers.authorization?.replace(/^Bearer\s+/i, '');
        const session = sessions.get(tokenValue);
        if (!session || session.expiresAt < Date.now()) {
            sessions.delete(tokenValue);
            return res.status(401).json({ error: 'Сессия истекла' });
        }
        try {
            req.auth = await getUserAuthContext(session.userId);
            req.auth.tgId = session.userId;
            req.auth.telegramUsername = session.username;
            if (req.auth.user && session.username && req.auth.user.tg_username !== session.username) {
                await User.updateOne({ _id: req.auth.user._id }, { $set: { tg_username: session.username } });
                req.auth.user.tg_username = session.username;
            }
            next();
        } catch (error) {
            res.status(500).json({ error: 'Не удалось проверить сессию' });
        }
    }

    function requireAdmin(req, res, next) {
        if (!req.auth?.isAdmin) return res.status(403).json({ error: 'Доступ только для администратора' });
        next();
    }

    function requireCronSecret(secret) {
        return (req, res, next) => {
            const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '');
            if (!provided || provided.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
                return res.status(401).json({ error: 'Требуется cron-аутентификация' });
            }
            next();
        };
    }

    return { createSession, getUserAuthContext, requireSession, requireAdmin, requireCronSecret, validateTelegramInitData };
}