import fs from 'fs';
import path from 'path';
import { User } from '../models/User.js';
import { Group } from '../models/Group.js';
import { Settings } from '../models/Settings.js';

function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getUserMention(user) {
    const firstName = user.firstName || String(user.username || '').trim().split(/\s+/)[0];
    const name = escapeHtml(firstName || 'Студент');
    if (user.tg_username) return `<b>${name}</b> (@${escapeHtml(user.tg_username.replace('@', ''))})`;
    return `<b><a href="tg://user?id=${user.tg_id}">${name}</a></b>`;
}

export function createBirthdayService(bot) {
    const birthdayTimeZone = process.env.BIRTHDAY_TIMEZONE || 'Europe/Moscow';
    function getCurrentBirthdayDate() {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: birthdayTimeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
        return {
            year: Number(values.year),
            currentMD: `${values.month}-${values.day}`,
        };
    }

    async function syncLocalBackup() {
        try {
            const users = await User.find().lean();
            fs.writeFileSync(path.resolve('backup_users.json'), JSON.stringify(users, null, 2));
            console.log(`💾 Локальный бэкап обновлен (${users.length} записей)`);
        } catch (error) {
            console.error('❌ Ошибка резервного копирования:', error.message);
        }
    }

    async function checkAndSendBirthdays() {
        const lock = await Settings.findOneAndUpdate(
            { key: 'service', $or: [{ birthdayCheckLockUntil: null }, { birthdayCheckLockUntil: { $exists: false } }, { birthdayCheckLockUntil: { $lt: new Date() } }] },
            { $set: { birthdayCheckLockUntil: new Date(Date.now() + 10 * 60 * 1000) } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).lean();
        if (!lock) {
            console.log('ℹ️ Проверка дней рождения уже выполняется, повторный запуск пропущен.');
            return;
        }

        try {
        const { year: currentYear, currentMD } = getCurrentBirthdayDate();
        const users = await User.find().populate('group_ids');
        const birthdayUsers = users.filter(user => user.birthday?.slice(5) === currentMD && user.lastCongratulatedYear !== currentYear);
        const groupMap = new Map();

        for (const user of birthdayUsers) {
            for (const group of user.group_ids || []) {
                const usersInGroup = groupMap.get(String(group._id)) || [];
                usersInGroup.push(user);
                groupMap.set(String(group._id), usersInGroup);
            }
        }

        const activeGroups = await Group.find({ _id: { $in: [...groupMap.keys()] }, active: true }).lean();
        const successfulGroups = new Set();

        async function sendWithRetry(group, message) {
            let lastError;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await bot.api.sendMessage(group.chatId, message, {
                        parse_mode: 'HTML',
                        ...(group.topicId ? { message_thread_id: group.topicId } : {})
                    });
                    return true;
                } catch (error) {
                    lastError = error;
                    const status = error?.error_code || error?.statusCode || error?.status;
                    const networkFailure = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'].includes(error?.code);
                    const temporaryFailure = networkFailure || status === 429 || Number(status) >= 500;
                    if (!temporaryFailure || attempt === 3) break;
                    await new Promise(resolve => setTimeout(resolve, attempt * 1000));
                }
            }
            console.error(`❌ Ошибка отправки в чат ${group.name} после 3 попыток:`, lastError?.message);
            return false;
        }

        await Promise.all(activeGroups.map(async group => {
            const groupUsers = groupMap.get(String(group._id)) || [];
            const message = groupUsers.length === 1
                ? `🎓 Сегодня свой день рождения отмечает ${getUserMention(groupUsers[0])}! Поздравляем! 🎂🎈`
                : `🎉 <b>Сегодня свой день рождения отмечают:</b>\n\n${groupUsers.map(user => `🎓 ${getUserMention(user)}`).join('\n')}\n\nПоздравляем именинников! 🎂🎈✨`;
            if (await sendWithRetry(group, message)) successfulGroups.add(String(group._id));
        }));

        for (const user of birthdayUsers) {
            const targetGroupIds = (user.group_ids || [])
                .map(group => String(group._id))
                .filter(groupId => activeGroups.some(group => String(group._id) === groupId));
            if (targetGroupIds.length > 0 && targetGroupIds.every(groupId => successfulGroups.has(groupId))) {
                user.lastCongratulatedYear = currentYear;
                await user.save();
            }
        }
        } finally {
            await Settings.updateOne({ key: 'service' }, { $set: { birthdayCheckLockUntil: null } });
        }
    }

    return { checkAndSendBirthdays, syncLocalBackup };
}