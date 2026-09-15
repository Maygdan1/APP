import express from 'express';
import { Bot, webhookCallback } from 'grammy';
import mongoose from 'mongoose';
import cors from 'cors';
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

async function registerTelegramGroup(ctx, topicId = null) {
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
                ...(topicId ? { topicId } : {})
            },
            $setOnInsert: { active: false }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`Telegram-группа обнаружена: ${chat.title || chat.id}${topicId ? `, topic ${topicId}` : ''}`);
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
    const pendingLimit = settings?.maxPendingGroupRequests ?? 50;
    if (settings && (!settings.acceptGroupRequests || pendingLimit <= await Group.countDocuments({ active: false, blocked: false, registrationUsedAt: { $ne: null } }))) return;
        const invite = await GroupInvite.findOne({ tokenHash: hashRegistrationKey(tokenValue), consumedAt: null });
    if (!invite) return;
    const existingChat = await Group.findOne({ chatId: chat.id, _id: { $ne: invite.groupId } });
    if (existingChat) return;
        const consumedInvite = await GroupInvite.findOneAndUpdate(
            { _id: invite._id, consumedAt: null },
            { $set: { consumedAt: new Date(), consumedChatId: chat.id, consumedTopicId: topicId } },
            { new: true }
        );
        if (!consumedInvite) return;
    await Group.findByIdAndUpdate(invite.groupId, {
        $set: {
            chatId: chat.id,
            name: chat.title || String(chat.id),
            topicId,
            active: false,
            registrationUsedAt: new Date(),
            registrationRequestedBy: ctx.from?.id || null
        }
    });
    console.log(`Принята заявка группы: ${chat.title || chat.id}, topic ${topicId ?? 'общий'}`);
}

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }));
app.use(express.json());
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

// Сохраняем topic_id молча, если Telegram прислал сообщение из форума.
// Ответов в групповых чатах бот не отправляет.
bot.on('message', async ctx => {
    if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') return;
    const invite = isInviteMessage(ctx);
    if (invite) {
        await consumeInvite(ctx, invite.token);
        return;
    }
    if (ctx.message?.message_thread_id) {
        await registerTelegramGroup(ctx, ctx.message.message_thread_id);
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

app.listen(port, () => {
    console.log(`🚀 Сервер запущен на порту ${port}`);
});
