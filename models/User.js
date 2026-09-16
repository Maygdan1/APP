import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    tg_id: { type: Number, required: true, unique: true },
    username: { type: String, trim: true, minlength: 5, maxlength: 32, match: /^[А-ЯЁ][а-яё]{1,14} [А-ЯЁ][а-яё]{1,14}$/ },
    firstName: { type: String, trim: true, minlength: 2, maxlength: 15, match: /^[А-ЯЁ][а-яё]{1,14}$/ },
    lastName: { type: String, trim: true, minlength: 2, maxlength: 15, match: /^[А-ЯЁ][а-яё]{1,14}$/ },
    tg_username: { type: String, trim: true, maxlength: 64 },
    birthday: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    role: { type: String, enum: ['child', 'mentor', 'admin'], default: 'child' },
    group_ids: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }], default: [] },
    group_index: Number,
    group_indexes: [Number],
    lastCongratulatedYear: { type: Number, default: 0 }
});

export const User = mongoose.model('User', userSchema);