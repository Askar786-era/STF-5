const mongoose = require('mongoose');

const bloodRequestSchema = new mongoose.Schema({
    patientName: { type: String, required: true },
    phone: { type: String, default: "" },
    bloodGroup: { type: String, required: true, index: true },
    city: { type: String, required: true, index: true },
    state: { type: String, required: true, index: true },
    hospital: { type: String, default: "" },
    message: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
});

bloodRequestSchema.index({ city: 1, state: 1 });

module.exports = mongoose.model('BloodRequest', bloodRequestSchema);
