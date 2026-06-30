const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { encrypt, decrypt, deterministicHash } = require('../utils/crypto');

const donorSchema = new mongoose.Schema({
    bloodGroup: { type: String, required: true, index: true },
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    phoneHash: { type: String, unique: true, index: true },
    password: { type: String, required: true },
    city: { type: String, required: true, index: true },
    state: { type: String, required: true, index: true },
    zipCode: { type: String, required: true, index: true },
    isOnline: { type: Boolean, default: false },
    socketId: { type: String, default: null },
    firebaseUid: { type: String, default: null },
    pushToken: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

donorSchema.index({ bloodGroup: 1, city: 1, state: 1 });

// Hash/encrypt fields before saving
donorSchema.pre('save', async function() {
    // Hash password with bcrypt (one-way)
    if (this.isModified('password')) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
    // Create deterministic phone hash for lookups + encrypt phone
    if (this.isModified('phone')) {
        this.phoneHash = deterministicHash(this.phone);
        this.phone = encrypt(this.phone);
    }
    // Encrypt PII fields
    if (this.isModified('fullName')) {
        this.fullName = encrypt(this.fullName);
    }
    if (this.isModified('city')) {
        this.city = encrypt(this.city);
    }
    if (this.isModified('state')) {
        this.state = encrypt(this.state);
    }
    if (this.isModified('zipCode')) {
        this.zipCode = encrypt(this.zipCode);
    }
});

// Helper to decrypt all PII fields
donorSchema.methods.decryptFields = function() {
    return {
        _id: this._id,
        bloodGroup: this.bloodGroup,
        fullName: decrypt(this.fullName),
        phone: decrypt(this.phone),
        password: this.password,
        city: decrypt(this.city),
        state: decrypt(this.state),
        zipCode: decrypt(this.zipCode),
        isOnline: this.isOnline,
        socketId: this.socketId,
        firebaseUid: this.firebaseUid,
        pushToken: this.pushToken,
        createdAt: this.createdAt
    };
};

module.exports = mongoose.model('Donor', donorSchema);
