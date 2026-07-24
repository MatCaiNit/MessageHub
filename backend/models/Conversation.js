import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
    {
        participants: [{type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true}],
        type: {type: String, enum: ['direct', 'group', 'device'], default: 'direct'},
        name: {type: String, default: ''},
        avatar: {type: String, default: ''},
        isPublic: {type: Boolean, default: false},
        adminId: {type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null},
        deviceId: {type: mongoose.Schema.Types.ObjectId, ref: 'Device', default: null},
        
        lastMessage: {type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null},
    },
    { timestamps: true }
);

export default mongoose.model('Conversation', conversationSchema);