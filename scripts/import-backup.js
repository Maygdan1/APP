import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';
import { User } from '../models/User.js';

const inputPath = path.resolve(process.env.BACKUP_FILE || 'backup_users.json');

if (!process.env.MONGO_URI) throw new Error('Укажите MONGO_URI');

try {
    await mongoose.connect(process.env.MONGO_URI);
    const users = JSON.parse(await fs.readFile(inputPath, 'utf8'));

    for (const item of users) {
        await User.findByIdAndUpdate(item._id, {
            $set: {
                role: item.role || 'child',
                tg_username: item.tg_username || '',
                group_index: item.group_index,
                group_indexes: item.group_indexes || [],
                username: item.username,
                birthday: item.birthday,
                group_ids: Array.isArray(item.group_ids) ? item.group_ids : [],
                lastCongratulatedYear: item.lastCongratulatedYear ?? 0
            }
        }, { upsert: true, new: true, runValidators: true });
    }

    console.log(`Синхронизировано пользователей: ${users.length}`);
} finally {
    await mongoose.disconnect();
}