var express = require('express');
var router = express.Router();
let path = require('path')
let multer = require('multer')
let mongoose = require('mongoose')
let { checkLogin } = require('../utils/authHandler')
let messageModel = require('../schemas/messages')
let userModel = require('../schemas/users')

let messageUpload = multer({
    storage: multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, 'uploads/')
        },
        filename: function (req, file, cb) {
            let ext = path.extname(file.originalname || '')
            let fileName = Date.now() + '-' + Math.round(Math.random() * 1_000_000_000) + ext
            cb(null, fileName)
        }
    }),
    limits: {
        fileSize: 10 * 1024 * 1024
    }
})

function useMessageUpload(req, res, next) {
    messageUpload.single('file')(req, res, function (error) {
        if (error) {
            res.status(400).send({
                message: error.message
            })
            return;
        }
        next();
    })
}

function getReceiverId(req) {
    return req.params.userId || req.body.to || req.body.toUserId || req.body.userId;
}

function getTextContent(req) {
    let rawText = req.body.content || req.body.text || req.body.message || '';
    return String(rawText).trim();
}

function buildFileUrl(req, filename) {
    return req.protocol + '://' + req.get('host') + '/upload/' + encodeURIComponent(filename);
}

router.get('/', checkLogin, async function (req, res, next) {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.userId)) {
            res.status(400).send({
                message: 'user dang nhap khong hop le'
            })
            return;
        }

        let currentUserId = new mongoose.Types.ObjectId(req.userId);
        let conversations = await messageModel.aggregate([
            {
                $match: {
                    $or: [
                        { from: currentUserId },
                        { to: currentUserId }
                    ]
                }
            },
            {
                $addFields: {
                    partner: {
                        $cond: [
                            { $eq: ['$from', currentUserId] },
                            '$to',
                            '$from'
                        ]
                    }
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            },
            {
                $group: {
                    _id: '$partner',
                    message: {
                        $first: '$$ROOT'
                    }
                }
            },
            {
                $replaceRoot: {
                    newRoot: '$message'
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            }
        ])

        conversations = await messageModel.populate(conversations, [
            {
                path: 'from',
                select: 'username email'
            },
            {
                path: 'to',
                select: 'username email'
            }
        ])

        res.send(conversations)
    } catch (error) {
        res.status(400).send({
            message: error.message
        })
    }
})

router.get('/:userId', checkLogin, async function (req, res, next) {
    try {
        let currentUserId = req.userId;
        let otherUserId = req.params.userId;

        if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
            res.status(400).send({
                message: 'userID khong hop le'
            })
            return;
        }

        let otherUser = await userModel.findOne({
            _id: otherUserId,
            isDeleted: false
        });

        if (!otherUser) {
            res.status(404).send({
                message: 'user nhan khong ton tai'
            })
            return;
        }

        let messages = await messageModel.find({
            $or: [
                {
                    from: currentUserId,
                    to: otherUserId
                },
                {
                    from: otherUserId,
                    to: currentUserId
                }
            ]
        }).sort({
            createdAt: 1
        }).populate({
            path: 'from',
            select: 'username email'
        }).populate({
            path: 'to',
            select: 'username email'
        })

        res.send(messages)
    } catch (error) {
        res.status(400).send({
            message: error.message
        })
    }
})

async function createMessage(req, res, next) {
    try {
        let receiverId = getReceiverId(req);
        if (!receiverId) {
            res.status(400).send({
                message: 'to la bat buoc'
            })
            return;
        }

        if (!mongoose.Types.ObjectId.isValid(receiverId)) {
            res.status(400).send({
                message: 'to khong hop le'
            })
            return;
        }

        if (String(receiverId) === String(req.userId)) {
            res.status(400).send({
                message: 'khong the gui tin nhan cho chinh minh'
            })
            return;
        }

        let receiver = await userModel.findOne({
            _id: receiverId,
            isDeleted: false
        });

        if (!receiver) {
            res.status(404).send({
                message: 'user nhan khong ton tai'
            })
            return;
        }

        let messageType = 'text';
        let messageContent = getTextContent(req);

        if (req.file) {
            messageType = 'file';
            messageContent = buildFileUrl(req, req.file.filename);
        }

        if (messageType === 'text' && !messageContent) {
            res.status(400).send({
                message: 'content text khong duoc de trong'
            })
            return;
        }

        let createdMessage = new messageModel({
            from: req.userId,
            to: receiverId,
            contentMessage: {
                type: messageType,
                content: messageContent
            }
        })

        await createdMessage.save();

        let result = await messageModel.findById(createdMessage._id).populate({
            path: 'from',
            select: 'username email'
        }).populate({
            path: 'to',
            select: 'username email'
        })

        res.send(result)
    } catch (error) {
        res.status(400).send({
            message: error.message
        })
    }
}

router.post('/', checkLogin, useMessageUpload, createMessage)
router.post('/:userId', checkLogin, useMessageUpload, createMessage)

module.exports = router;
