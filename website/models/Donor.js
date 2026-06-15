const mongoose = require('mongoose');

const donorSchema = new mongoose.Schema({
    bloodGroup: { type: String, required: true, index: true },
    fullName: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
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

module.exports = mongoose.model('Donor', donorSchema);
