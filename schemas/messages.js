let mongoose = require('mongoose')

let messageSchema = mongoose.Schema({
    from: {
        type: mongoose.Types.ObjectId,
        ref: 'user',
        required: true
    },
    to: {
        type: mongoose.Types.ObjectId,
        ref: 'user',
        required: true
    },
    contentMessage: {
        type: {
            type: String,
            enum: ['file', 'text'],
            required: true
        },
        content: {
            type: String,
            required: true,
            trim: true
        }
    }
}, {
    timestamps: true
})

messageSchema.index({ from: 1, to: 1, createdAt: -1 })
messageSchema.index({ to: 1, from: 1, createdAt: -1 })

module.exports = mongoose.model('message', messageSchema)
