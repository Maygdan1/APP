import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
    key: { type: String, unique: true, default: 'service' },
    acceptGroupRequests: { type: Boolean, default: true },
    acceptNewUsers: { type: Boolean, default: true },
    maxPendingGroupRequests: { type: Number, default: 50, min: 1, max: 1000 }
}, { timestamps: true });

export const Settings = mongoose.model('Settings', settingsSchema);