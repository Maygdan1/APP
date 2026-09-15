import express from 'express';
import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import { User } from '../models/User.js';
import { Group } from '../models/Group.js';
import { Settings } from '../models/Settings.js';
import { GroupInvite } from '../models/GroupInvite.js';

export function createApiRouter({ auth, birthdayService, bot, hashRegistrationKey }) {
    const router = express.Router();
    const { requireSession, requireAdmin } = auth;

    router.post('/auth/session', (req, res) => {
        const telegramUser = auth.validateTelegramInitData(req.body?.initData);
        if (!telegramUser) return res.status(401).json({ error: 'Недействительные данные Telegram' });
        res.json(auth.createSession(telegramUser.id));
    });

    router.post('/save-birthday', requireSession, async (req, res) => {
        const { username, birthday, group_id: groupId } = req.body;
        if (!username || !birthday || !mongoose.isValidObjectId(groupId)) return res.status(400).json({ error: 'Неполные данные' });
        try {
            const group = await Group.findOne({ _id: groupId, active: true });
            if (!group) return res.status(400).json({ error: 'Группа не найдена' });
            const existingUser = await User.findOne({ tg_id: req.auth.tgId });
            const settings = await Settings.findOne({ key: 'service' }).lean();
            if (!existingUser && settings && !settings.acceptNewUsers) {
                return res.status(423).json({ error: 'Регистрация новых пользователей временно отключена' });
            }
            const update = { username, birthday };
            const user = existingUser?.role === 'mentor'
                ? Object.assign(existingUser, update)
                : await User.findOneAndUpdate({ tg_id: req.auth.tgId }, { ...update, group_ids: [group._id] }, { upsert: true, new: true });
            await user.save();
            await birthdayService.syncLocalBackup();
            res.json({ success: true, user });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/user/me', requireSession, async (req, res) => {
        const user = await User.findOne({ tg_id: req.auth.tgId }).populate('group_ids');
        if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });
        res.json({ success: true, user });
    });

    router.get('/groups', requireSession, async (req, res) => {
        res.json({ groups: await Group.find({ active: true }).sort({ name: 1 }).lean() });
    });

    router.get('/calendar', requireSession, async (req, res) => {
        if (!req.auth.user) return res.status(403).json({ error: 'Сначала заполните форму пользователя' });
        const approvedGroups = await Group.find({
            _id: { $in: req.auth.groups.map(group => group._id) },
            active: true
        }).sort({ name: 1 }).lean();
        if (!approvedGroups.length) return res.status(403).json({ error: 'Для пользователя пока нет утвержденной группы' });
        const groupIds = approvedGroups.map(group => group._id);
        const users = await User.find({ group_ids: { $in: groupIds } }).populate('group_ids').lean();
        res.json({ users, groups: approvedGroups });
    });

    router.get('/users', requireSession, async (req, res) => {
        const { isAdmin, isMentor, groups } = req.auth;
        if (!isAdmin && !isMentor) return res.status(403).json({ error: 'Доступ разрешен только админам и наставникам' });
        const query = isAdmin ? {} : { group_ids: { $in: groups.map(group => group._id) } };
        const users = await User.find(query).populate('group_ids').lean();
        const visibleGroups = isAdmin ? await Group.find({ active: true }).lean() : groups;
        res.json({ success: true, role: isAdmin ? 'admin' : 'mentor', currentUser: req.auth.user, mentorGroups: groups, groups: visibleGroups, users });
    });

    router.post('/admin/update-user-role', requireSession, requireAdmin, async (req, res) => {
        const { target_user_id: targetUserId, role, group_ids: groupIds } = req.body;
        if (!targetUserId || !['child', 'mentor', 'admin'].includes(role) || !Array.isArray(groupIds)) return res.status(400).json({ error: 'Некорректные данные пользователя' });
        if (role === 'child' && groupIds.length !== 1) return res.status(400).json({ error: 'Студенту можно назначить только одну группу' });
        const validGroups = await Group.countDocuments({ _id: { $in: groupIds }, active: true });
        if (validGroups !== groupIds.length) return res.status(400).json({ error: 'Можно назначать только активные группы' });
        const user = await User.findOneAndUpdate({ _id: targetUserId }, { role, group_ids: groupIds }, { new: true });
        await birthdayService.syncLocalBackup();
        res.json({ success: true, user });
    });

    router.delete('/admin/users/:userId', requireSession, requireAdmin, async (req, res) => {
        if (!mongoose.isValidObjectId(req.params.userId)) return res.status(400).json({ error: 'Некорректный пользователь' });
        if (String(req.auth.user?._id) === String(req.params.userId)) {
            return res.status(400).json({ error: 'Нельзя удалить свою учетную запись' });
        }
        const user = await User.findById(req.params.userId).lean();
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
        if (user.role === 'admin' && await User.countDocuments({ role: 'admin' }) <= 1) {
            return res.status(400).json({ error: 'Нельзя удалить последнего администратора' });
        }
        await User.deleteOne({ _id: req.params.userId });
        await birthdayService.syncLocalBackup();
        res.json({ success: true });
    });

    router.post('/admin/groups', requireSession, requireAdmin, async (req, res) => {
        const { name, chatId, topicId } = req.body || {};
        if (!name || !Number.isSafeInteger(Number(chatId))) return res.status(400).json({ error: 'Название и числовой Chat ID обязательны' });
        try {
            const group = await Group.create({ name, chatId: Number(chatId), topicId: topicId === '' || topicId == null ? null : Number(topicId) });
            res.status(201).json({ success: true, group });
        } catch (error) {
            res.status(409).json({ error: error.code === 11000 ? 'Такая группа или чат уже существует' : error.message });
        }
    });

    router.get('/admin/groups', requireSession, requireAdmin, async (req, res) => {
        res.json({ groups: await Group.find().sort({ name: 1 }).lean() });
    });

    router.get('/admin/settings', requireSession, requireAdmin, async (req, res) => {
        const settings = await Settings.findOneAndUpdate(
            { key: 'service' }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
        res.json({ settings });
    });

    router.patch('/admin/settings', requireSession, requireAdmin, async (req, res) => {
        const { acceptGroupRequests, acceptNewUsers, maxPendingGroupRequests } = req.body || {};
        const settings = await Settings.findOneAndUpdate(
            { key: 'service' },
            {
                ...(typeof acceptGroupRequests === 'boolean' ? { acceptGroupRequests } : {}),
                ...(typeof acceptNewUsers === 'boolean' ? { acceptNewUsers } : {})
                ,...(Number.isInteger(Number(maxPendingGroupRequests)) ? { maxPendingGroupRequests: Number(maxPendingGroupRequests) } : {})
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
        res.json({ success: true, settings });
    });

    router.post('/admin/backup', requireSession, requireAdmin, async (req, res) => {
        const users = await User.find().lean();
        await fs.writeFile(path.resolve('backup_users.json'), `${JSON.stringify(users, null, 2)}\n`, 'utf8');
        res.json({ success: true, count: users.length });
    });

    router.get('/admin/backup/download', requireSession, requireAdmin, async (req, res) => {
        const users = await User.find().lean();
        const content = `${JSON.stringify(users, null, 2)}\n`;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="birthday-users-${new Date().toISOString().slice(0, 10)}.json"`);
        res.send(content);
    });

    router.patch('/admin/groups/:groupId', requireSession, requireAdmin, async (req, res) => {
        const { name, chatId, topicId, active, blocked } = req.body || {};
        if (!mongoose.isValidObjectId(req.params.groupId)) return res.status(400).json({ error: 'Некорректная группа' });
        const group = await Group.findByIdAndUpdate(req.params.groupId, {
            ...(name ? { name } : {}),
            ...(chatId !== undefined ? { chatId: Number(chatId) } : {}),
            ...(topicId !== undefined ? { topicId: topicId === '' ? null : Number(topicId) } : {}),
            ...(active !== undefined ? { active: Boolean(active) } : {}),
            ...(blocked !== undefined ? { blocked: Boolean(blocked) } : {})
        }, { new: true, runValidators: true });
        if (!group) return res.status(404).json({ error: 'Группа не найдена' });
        res.json({ success: true, group });
    });

    router.post('/admin/groups/:groupId/check', requireSession, requireAdmin, async (req, res) => {
        if (!mongoose.isValidObjectId(req.params.groupId)) return res.status(400).json({ error: 'Некорректная группа' });
        const group = await Group.findById(req.params.groupId).lean();
        if (!group) return res.status(404).json({ error: 'Группа не найдена' });
        try {
            const me = await bot.api.getMe();
            const chat = await bot.api.getChat(group.chatId);
            const member = await bot.api.getChatMember(group.chatId, me.id);
            const canPost = member.status === 'administrator'
                ? member.can_post_messages !== false
                : ['member', 'creator'].includes(member.status);
            res.json({ success: true, chat: { id: chat.id, title: chat.title, type: chat.type }, botStatus: member.status, canPost });
        } catch (error) {
            res.status(400).json({ error: `Не удалось проверить бота: ${error.description || error.message}` });
        }
    });

    router.post('/admin/groups/:groupId/invite', requireSession, requireAdmin, async (req, res) => {
        if (!mongoose.isValidObjectId(req.params.groupId)) return res.status(400).json({ error: 'Некорректная группа' });
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ error: 'Группа не найдена' });
        await GroupInvite.deleteMany({ groupId: group._id, consumedAt: null });
        const tokenValue = crypto.randomBytes(32).toString('base64url');
        await GroupInvite.create({ groupId: group._id, tokenHash: hashRegistrationKey(tokenValue), createdBy: req.auth.tgId });
        const botUser = await bot.api.getMe();
        await Group.updateOne({ _id: group._id }, { $set: { active: false, registrationUsedAt: null, topicId: null } });
        res.json({ success: true, message: `@${botUser.username}(${tokenValue})` });
    });

    router.delete('/admin/groups/:groupId', requireSession, requireAdmin, async (req, res) => {
        if (!mongoose.isValidObjectId(req.params.groupId)) return res.status(400).json({ error: 'Некорректная группа' });
        const group = await Group.findByIdAndDelete(req.params.groupId);
        if (!group) return res.status(404).json({ error: 'Группа не найдена' });
        res.json({ success: true });
    });

    router.get('/check-birthdays', requireSession, requireAdmin, async (req, res) => {
        try {
            await birthdayService.checkAndSendBirthdays();
            res.json({ success: true, message: 'Проверка выполнена' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}