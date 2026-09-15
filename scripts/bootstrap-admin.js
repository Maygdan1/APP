import mongoose from 'mongoose';
import 'dotenv/config';
import { User } from '../models/User.js';
import { Group } from '../models/Group.js';

const groupSeed = JSON.parse(process.env.GROUPS_JSON || '[]');
const adminTelegramId = Number(process.env.ADMIN_TG_ID);

if (!process.env.MONGO_URI || !adminTelegramId) {
    throw new Error('Для bootstrap нужны MONGO_URI и ADMIN_TG_ID');
}

await mongoose.connect(process.env.MONGO_URI);
const groups = [];
for (const item of groupSeed) {
    groups.push(await Group.findOneAndUpdate(
        { chatId: Number(item.chatId) },
        { name: item.name, topicId: item.topicId ?? null, active: true },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ));
}

await User.updateOne({ tg_id: adminTelegramId }, { $set: { role: 'admin' } }, { upsert: true });
const legacyUsers = await User.find({ $or: [{ group_index: { $exists: true } }, { group_indexes: { $exists: true } }] });
for (const user of legacyUsers) {
    const indexes = user.group_indexes?.length ? user.group_indexes : [user.group_index];
    const groupIds = indexes.filter(Number.isInteger).map(index => groups[index]?._id).filter(Boolean);
    if (groupIds.length) await User.updateOne({ _id: user._id }, { $set: { group_ids: groupIds } });
}

console.log(`Готово: администратор ${adminTelegramId} и ${groups.length} групп подготовлены.`);
await mongoose.disconnect();