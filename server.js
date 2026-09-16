import express from 'express';
import { Bot, webhookCallback } from 'grammy';
import mongoose from 'mongoose';
import crypto from 'crypto';
import 'dotenv/config';
import { createAuthService } from './services/auth.js';
import { createBirthdayService } from './services/birthday-service.js';
import { createApiRouter } from './routes/api.js';
import { Group } from './models/Group.js';
import { Settings } from './models/Settings.js';
import { GroupInvite } from './models/GroupInvite.js';

const token = process.env.BOT_TOKEN;
const mongoUri = process.env.MONGO_URI;
const port = process.env.PORT || 10000;
const sessionSecret = process.env.SESSION_SECRET;
const webhookUrl = `https://birthday-bot-backend-jl75.onrender.com/webhook/${token}`;

if (!token || !mongoUri || !sessionSecret) {
    throw new Error('BOT_TOKEN, MONGO_URI и SESSION_SECRET обязательны');
}

const bot = new Bot(token);
const app = express();
const auth = createAuthService({ token, sessionSecret });
const birthdayService = createBirthdayService(bot);

async function registerTelegramGroup(ctx) {
    const chat = ctx.chat;
    if (!chat || !['group', 'supergroup'].includes(chat.type)) return;
    const settings = await Settings.findOne({ key: 'service' }).lean();
    if (settings && !settings.acceptGroupRequests) return;

    const existing = await Group.findOne({ chatId: chat.id });
    if (existing?.active || existing?.registrationUsedAt) return;

    const telegramName = chat.title || String(chat.id);
    const duplicateName = await Group.findOne({
        name: telegramName,
        ...(existing ? { _id: { $ne: existing._id } } : {})
    }).lean();
    const safeName = duplicateName ? `${telegramName} [${chat.id}]` : telegramName;

    await Group.findOneAndUpdate(
        { chatId: chat.id },
        {
            $set: {
                name: safeName,
            },
            $setOnInsert: { active: false }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`Telegram-группа обнаружена: ${chat.title || chat.id}`);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hashRegistrationKey(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function isInviteMessage(ctx) {
    const username = ctx.me?.username;
    const text = ctx.message?.text || '';
    if (!username) return null;
    const pattern = new RegExp(`@${escapeRegExp(username)}\\(([^)\\n]+)\\)`, 'i');
    const match = text.match(pattern);
    if (!match) return null;
    return { token: match[1].trim() };
}

async function consumeInvite(ctx, tokenValue) {
    const chat = ctx.chat;
    if (!chat || !['group', 'supergroup'].includes(chat.type)) return;
    const topicId = ctx.message?.message_thread_id || null;
    const settings = await Settings.findOne({ key: 'service' }).lean();
    const pendingLimit = Math.min(settings?.maxPendingGroupRequests ?? 5, 10);
    if (settings && (!settings.acceptGroupRequests || pendingLimit <= await Group.countDocuments({ active: false, blocked: false, registrationUsedAt: { $ne: null } }))) return;
        const invite = await GroupInvite.findOne({ tokenHash: hashRegistrationKey(tokenValue), consumedAt: null });
    if (!invite) return;
        const invitedGroup = await Group.findById(invite.groupId).lean();
        if (!invitedGroup || invitedGroup.blocked || invitedGroup.active) return;
    const existingChat = await Group.findOne({ chatId: chat.id, _id: { $ne: invite.groupId } });
    if (existingChat) return;
        const consumedInvite = await GroupInvite.findOneAndUpdate(
            { _id: invite._id, consumedAt: null },
            { $set: { consumedAt: new Date(), consumedChatId: chat.id, consumedTopicId: topicId } },
            { new: true }
        );
        if (!consumedInvite) return;
        const telegramName = chat.title || String(chat.id);
        const duplicateName = await Group.findOne({ name: telegramName, _id: { $ne: invite.groupId } }).lean();
        const safeName = duplicateName ? `${telegramName} [${chat.id}]` : telegramName;
    await Group.findByIdAndUpdate(invite.groupId, {
        $set: {
            chatId: chat.id,
                name: safeName,
            topicId,
                active: true,
            registrationUsedAt: new Date(),
            registrationRequestedBy: ctx.from?.id || null
        }
    });
    console.log(`Принята заявка группы: ${chat.title || chat.id}, topic ${topicId ?? 'общий'}`);
}

app.disable('x-powered-by');
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});
app.use(express.json({ limit: '32kb' }));
app.use(express.static('public'));
app.get('/ping', (req, res) => res.status(200).send('OK'));
app.use('/api', createApiRouter({ auth, birthdayService, bot, hashRegistrationKey }));

bot.on('my_chat_member', async ctx => {
    const status = ctx.myChatMember?.new_chat_member?.status;
    if (['member', 'administrator'].includes(status)) await registerTelegramGroup(ctx);
    if (['left', 'kicked'].includes(status) && ctx.chat) {
        await Group.updateOne({ chatId: ctx.chat.id }, { $set: { active: false } });
    }
});

// Обрабатываем только одноразовые приглашения. Обычные сообщения и новые топики игнорируются.
bot.on('message', async ctx => {
    if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') return;
    const invite = isInviteMessage(ctx);
    if (invite) {
        await consumeInvite(ctx, invite.token);
    }
});

app.post(`/webhook/${token}`, webhookCallback(bot, 'express'));

mongoose.connect(mongoUri)
    .then(async () => {
        console.log('✅ База данных MongoDB успешно подключена');
        await birthdayService.syncLocalBackup();
    })
    .catch(error => console.error('❌ Ошибка подключения к MongoDB:', error));

bot.api.setWebhook(webhookUrl).catch(error => console.error('❌ Webhook error:', error));
bot.api.setMyCommands([], { scope: { type: 'all_group_chats' } })
    .catch(error => console.error('❌ Ошибка настройки команд групп:', error));
bot.catch(error => console.error('❌ Ошибка Telegram update:', error.error || error));

app.listen(port, () => {
    console.log(`🚀 Сервер запущен на порту ${port}`);
});
