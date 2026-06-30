const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/crypto');

const bloodRequestSchema = new mongoose.Schema({
    patientName: { type: String, required: true },
    phone: { type: String, default: "" },
    socketId: { type: String, default: "" },
    bloodGroup: { type: String, required: true, index: true },
    city: { type: String, required: true, index: true },
    state: { type: String, required: true, index: true },
    hospital: { type: String, default: "" },
    message: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
});

bloodRequestSchema.index({ city: 1, state: 1 });

// Encrypt PII fields before saving
bloodRequestSchema.pre('save', async function() {
    if (this.isModified('patientName') && this.patientName) {
        this.patientName = encrypt(this.patientName);
    }
    if (this.isModified('phone') && this.phone) {
        this.phone = encrypt(this.phone);
    }
    if (this.isModified('hospital') && this.hospital) {
        this.hospital = encrypt(this.hospital);
    }
});

// Helper to decrypt all PII fields
bloodRequestSchema.methods.decryptFields = function() {
    return {
        _id: this._id,
        patientName: decrypt(this.patientName),
        phone: decrypt(this.phone),
        socketId: this.socketId,
        bloodGroup: this.bloodGroup,
        city: this.city,
        state: this.state,
        hospital: decrypt(this.hospital),
        message: this.message,
        createdAt: this.createdAt
    };
};

module.exports = mongoose.model('BloodRequest', bloodRequestSchema);
