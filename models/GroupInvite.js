import mongoose from 'mongoose';

const groupInviteSchema = new mongoose.Schema({
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    createdBy: { type: Number, required: true },
    consumedAt: { type: Date, default: null },
    consumedChatId: { type: Number, default: null },
    consumedTopicId: { type: Number, default: null }
}, { timestamps: true });

export const GroupInvite = mongoose.model('GroupInvite', groupInviteSchema);