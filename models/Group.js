import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, unique: true },
    chatId: { type: Number, required: true, unique: true },
    topicId: { type: Number, default: null },
    active: { type: Boolean, default: true },
    blocked: { type: Boolean, default: false },
    registrationUsedAt: { type: Date, default: null },
    registrationRequestedBy: { type: Number, default: null }
}, { timestamps: true });

export const Group = mongoose.model('Group', groupSchema);