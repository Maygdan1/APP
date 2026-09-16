import fs from 'fs';
import path from 'path';
import { User } from '../models/User.js';
import { Group } from '../models/Group.js';

function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getUserMention(user) {
    const fullName = user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.username;
    const name = escapeHtml(fullName || 'Студент');
    if (user.tg_username) return `<b>${name}</b> (@${escapeHtml(user.tg_username.replace('@', ''))})`;
    return `<b><a href="tg://user?id=${user.tg_id}">${name}</a></b>`;
}

export function createBirthdayService(bot) {
    const birthdayTimeZone = process.env.BIRTHDAY_TIMEZONE || 'Europe/Moscow';
    const birthdayHour = Number.isInteger(Number(process.env.BIRTHDAY_HOUR))
        ? Math.min(Math.max(Number(process.env.BIRTHDAY_HOUR), 0), 23)
        : 6;
    let scheduledCheckInProgress = false;

    function getCurrentBirthdayDate() {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: birthdayTimeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
        return {
            year: Number(values.year),
            currentMD: `${values.month}-${values.day}`,
            hour: Number(values.hour)
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

        const congratulatedIds = new Set();
        for (const [groupId, groupUsers] of groupMap) {
            const group = await Group.findOne({ _id: groupId, active: true }).lean();
            if (!group) continue;
            const message = groupUsers.length === 1
                ? `🎓 Сегодня свой день рождения отмечает ${getUserMention(groupUsers[0])}! Поздравляем! 🎂🎈`
                : `🎉 <b>Сегодня свой день рождения отмечают:</b>\n\n${groupUsers.map(user => `🎓 ${getUserMention(user)}`).join('\n')}\n\nПоздравляем именинников! 🎂🎈✨`;

            try {
                await bot.api.sendMessage(group.chatId, message, {
                    parse_mode: 'HTML',
                    ...(group.topicId ? { message_thread_id: group.topicId } : {})
                });
                groupUsers.forEach(user => congratulatedIds.add(user.tg_id));
            } catch (error) {
                console.error(`❌ Ошибка отправки в чат ${group.name}:`, error.message);
            }
        }

        for (const user of birthdayUsers) {
            if (congratulatedIds.has(user.tg_id)) {
                user.lastCongratulatedYear = currentYear;
                await user.save();
            }
        }
    }

    async function runScheduledCheck() {
        const { hour } = getCurrentBirthdayDate();
        if (hour < birthdayHour || scheduledCheckInProgress) return;
        scheduledCheckInProgress = true;
        try {
            await checkAndSendBirthdays();
        } catch (error) {
            console.error('❌ Ошибка плановой проверки дней рождения:', error.message);
        } finally {
            scheduledCheckInProgress = false;
        }
    }

    function startScheduler() {
        runScheduledCheck();
        const timer = setInterval(runScheduledCheck, 60_000);
        timer.unref?.();
    }

    return { checkAndSendBirthdays, syncLocalBackup, startScheduler };
}