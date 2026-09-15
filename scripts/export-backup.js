import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';
import { User } from '../models/User.js';

const outputPath = path.resolve(process.env.BACKUP_FILE || 'backup_users.json');
const mongoUri = process.env.MONGO_URI?.trim().replace(/^['"]|['"]$/g, '');

if (!mongoUri || mongoUri.startsWith('replace_with_') || !/^mongodb(?:\+srv)?:\/\//.test(mongoUri)) {
    throw new Error('MONGO_URI должен начинаться с mongodb:// или mongodb+srv://.');
}

try {
    await mongoose.connect(mongoUri);
    const users = await User.find().lean();
    const temporaryPath = `${outputPath}.tmp`;

    await fs.writeFile(temporaryPath, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, outputPath);

    console.log(`Экспортировано пользователей: ${users.length}`);
    console.log(`Файл: ${outputPath}`);
} finally {
    await mongoose.disconnect();
}