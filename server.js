const fs = require('fs');
const path = require('path');
if (fs.existsSync(path.join(__dirname, '.env'))) {
    const envConfig = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    envConfig.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length > 1) {
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim().replace(/(^['"]|['"]$)/g, '');
            process.env[key] = val;
        }
    });
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const bcrypt = require('bcryptjs');
const Donor = require('./models/Donor');
const Stats = require('./models/Stats');
const BloodRequest = require('./models/BloodRequest');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const onlineDonors = {}; 
const onlineRequesters = {}; 
const activeCalls = {}; 

// SMS Gateway Integration (MSG91, Fast2SMS, Twilio)
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID; // Required for MSG91
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;

async function sendSMS(to, body) {
    let cleanPhone = to.replace(/\D/g, '');
    if (cleanPhone.length > 10) {
        cleanPhone = cleanPhone.slice(-10);
    }

    // 1. MSG91 (India - Very Cheap ~₹0.20/SMS)
    if (MSG91_AUTH_KEY && MSG91_TEMPLATE_ID) {
        try {
            const response = await fetch('https://control.msg91.com/api/v5/flow/', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'content-type': 'application/json',
                    'authkey': MSG91_AUTH_KEY
                },
                body: JSON.stringify({
                    template_id: MSG91_TEMPLATE_ID,
                    short_url: "0",
                    recipients: [{ mobiles: "91" + cleanPhone, message: body }]
                })
            });
            const data = await response.json();
            if (data.type === 'success') {
                console.log(`✅ SMS sent successfully via MSG91 to ${cleanPhone}`);
                return { success: true, provider: 'MSG91' };
            } else {
                console.error(`❌ MSG91 Error:`, data.message);
                return { success: false, error: data.message, provider: 'MSG91' };
            }
        } catch (err) {
            console.error(`❌ Error in MSG91 send:`, err.message);
            return { success: false, error: err.message, provider: 'MSG91' };
        }
    }

    // 2. Fast2SMS (Indian Gateway)
    if (FAST2SMS_API_KEY) {
        try {
            // cleanPhone is already defined above
            
            const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
                method: 'POST',
                headers: {
                    'authorization': FAST2SMS_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    route: 'q',
                    message: body,
                    flash: 0,
                    numbers: cleanPhone
                })
            });
            const data = await response.json();
            if (response.ok && data.return === true) {
                console.log(`✅ SMS sent successfully via Fast2SMS to ${cleanPhone}`);
                return { success: true, provider: 'Fast2SMS' };
            } else {
                console.error(`❌ Fast2SMS Error:`, data.message || data);
                return { success: false, error: data.message || data, provider: 'Fast2SMS' };
            }
        } catch (err) {
            console.error(`❌ Error in Fast2SMS send:`, err.message);
            return { success: false, error: err.message, provider: 'Fast2SMS' };
        }
    }

    // 2. Twilio (Global Gateway)
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
        try {
            let formattedPhone = to;
            if (!formattedPhone.startsWith('+')) {
                const digits = formattedPhone.replace(/\D/g, '');
                if (digits.length === 10) {
                    formattedPhone = '+91' + digits;
                } else {
                    formattedPhone = '+' + digits;
                }
            }

            const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
            const params = new URLSearchParams();
            params.append('To', formattedPhone);
            params.append('From', TWILIO_PHONE_NUMBER);
            params.append('Body', body);

            const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params
            });

            const data = await response.json();
            if (response.ok) {
                console.log(`✅ SMS sent successfully via Twilio to ${formattedPhone}`);
                return { success: true, provider: 'Twilio', sid: data.sid };
            } else {
                console.error(`❌ Twilio Error:`, data.message);
                return { success: false, error: data.message, provider: 'Twilio' };
            }
        } catch (err) {
            console.error(`❌ Error in Twilio send:`, err.message);
            return { success: false, error: err.message, provider: 'Twilio' };
        }
    }

    // 3. Fallback to Simulation (if no credentials are set)
    console.log(`[SMS SIMULATION] To: ${to} | Message: ${body}`);
    return { success: true, simulated: true };
}

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'STF.html'));
});

// Database Connection — Uses Atlas (MONGODB_URI env var) on Render/production, falls back to local or in-memory DB
const { MongoMemoryServer } = require('mongodb-memory-server');

async function connectDB() {
    const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/stranger_to_friends";
    
    try {
        await mongoose.connect(MONGODB_URI);
        const dbType = process.env.MONGODB_URI ? "☁️ MongoDB Atlas" : "💻 Local MongoDB";
        console.log(`✅ SUCCESS: Connected to ${dbType}!`);
    } catch (err) {
        if (!process.env.MONGODB_URI) {
            console.log("⚠️ Local MongoDB connection failed, starting in-memory MongoDB...");
            try {
                const mongod = await MongoMemoryServer.create();
                const uri = mongod.getUri();
                await mongoose.connect(uri);
                console.log(`✅ SUCCESS: Connected to In-Memory MongoDB!`);
            } catch (memErr) {
                console.error("❌ IN-MEMORY MONGODB ERROR:", memErr.message);
                process.exit(1);
            }
        } else {
            console.error("❌ CONNECTION ERROR:", err.message);
            process.exit(1);
        }
    }

    // Initialize stats
    try {
        const stats = ['bloodRequests', 'livesSaved'];
        for (const key of stats) {
            await Stats.findOneAndUpdate({ key }, { $setOnInsert: { value: 0 } }, { upsert: true });
        }
    } catch (statErr) {
        console.error("❌ STATS INITIATION ERROR:", statErr.message);
    }
}

connectDB();

io.on('connection', (socket) => {
    socket.on('requesterOnline', (phone) => {
        onlineRequesters[phone] = socket.id;
    });
    // Initial count (Total Registered Donors)
    Donor.countDocuments().then(count => socket.emit('donorCountUpdate', count));
    
    Stats.find({}).then(allStats => {

        const statsObj = {};
        allStats.forEach(s => statsObj[s.key] = s.value);
        socket.emit('globalStatsUpdate', statsObj);
    });

    socket.on('donorOnline', async (phone) => {
        await Donor.findOneAndUpdate({ phone }, { isOnline: true, socketId: socket.id });
        onlineDonors[phone] = socket.id;
        // We still show total registered donors on the home page stats for "Active Donors"
        io.emit('donorCountUpdate', await Donor.countDocuments());
    });

    socket.on('disconnect', async () => {
        await Donor.findOneAndUpdate({ socketId: socket.id }, { isOnline: false, socketId: null });
        io.emit('donorCountUpdate', await Donor.countDocuments());

        // Remove from onlineRequesters if applicable
        for (const phone in onlineRequesters) {
            if (onlineRequesters[phone] === socket.id) {
                delete onlineRequesters[phone];
                break;
            }
        }

        // Handle disconnect during active call
        const peerSocketId = activeCalls[socket.id];
        if (peerSocketId) {
            io.to(peerSocketId).emit('callEnded');
            delete activeCalls[peerSocketId];
            delete activeCalls[socket.id];
        }
    });

    socket.on('endCall', () => {
        const peerSocketId = activeCalls[socket.id];
        if (peerSocketId) {
            io.to(peerSocketId).emit('callEnded');
            delete activeCalls[peerSocketId];
            delete activeCalls[socket.id];
        }
    });

    // Call Signaling
    socket.on('callUser', async ({ donorPhone, phone, signalData, callerName, type }) => {
        const targetPhone = phone || donorPhone;
        const targetType = type || 'donor';

        if (targetType === 'donor') {
            const donor = await Donor.findOne({ phone: targetPhone });
            if (donor && donor.isOnline && donor.socketId) {
                io.to(donor.socketId).emit('incomingCall', { signal: signalData, from: callerName, callerSocket: socket.id });
            } else if (donor) {
                // Donor is offline - Send real SMS Notification
                await sendSMS(targetPhone, `URGENT BLOOD ALERT: ${callerName} needs your help! Please log in to Stranger to Friends immediately to accept the call.`);
                socket.emit('callError', { message: 'Donor is offline. An urgent SMS notification has been sent to them!' });
            } else {
                socket.emit('callError', { message: 'Donor not found.' });
            }
        } else if (targetType === 'requester') {
            const requesterSocketId = onlineRequesters[targetPhone];
            if (requesterSocketId) {
                io.to(requesterSocketId).emit('incomingCall', { signal: signalData, from: callerName, callerSocket: socket.id });
            } else {
                // Requester is offline - Send real SMS Notification
                await sendSMS(targetPhone, `URGENT: A donor (${callerName}) is trying to contact you regarding your blood request. Please open the Stranger to Friends app to answer the call.`);
                socket.emit('callError', { message: 'Requester is offline. An SMS notification has been sent to them!' });
            }
        }
    });

    socket.on('answerCall', async (data) => {
        activeCalls[socket.id] = data.to;
        activeCalls[data.to] = socket.id;
        io.to(data.to).emit('callAccepted', { signal: data.signal, donorSocket: socket.id });

        // Increment lives saved when the call is accepted/attended
        try {
            const stat = await Stats.findOneAndUpdate({ key: 'livesSaved' }, { $inc: { value: 1 } }, { upsert: true, new: true });
            io.emit('globalStatsUpdate', { livesSaved: stat.value });
        } catch (err) {
            console.error('Error incrementing lives saved stats:', err);
        }
    });
    socket.on('iceCandidate', (data) => io.to(data.to).emit('iceCandidate', data.candidate));
});

// Helper: escape special regex characters
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper: build a flexible regex that ignores spaces (e.g. "tamil nadu" matches "tamilnadu" and vice versa)
function flexibleRegex(str) {
    if (!str) return '';
    const trimmed = str.trim();
    const escapedParts = [];
    for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];
        if (/\s/.test(char)) {
            continue;
        }
        const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        escapedParts.push(escapedChar);
    }
    return escapedParts.join('\\s*');
}

// API Routes
app.post('/api/blood-requests', async (req, res) => {
    try {
        // Trim city and state before saving
        if (req.body.city) req.body.city = req.body.city.trim();
        if (req.body.state) req.body.state = req.body.state.trim();
        const newRequest = new BloodRequest(req.body);
        await newRequest.save();
        res.status(201).json({ success: true, request: newRequest });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/blood-requests/district', async (req, res) => {
    try {
        const { city, state } = req.query;
        let query = {};
        if (city) query.city = { $regex: new RegExp(flexibleRegex(city), "i") };
        if (state) query.state = { $regex: new RegExp(flexibleRegex(state), "i") };
        
        const requests = await BloodRequest.find(query).sort({ createdAt: -1 });
        res.json(requests);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/donors', async (req, res) => {
    // Trim city, state, and zipCode before saving
    if (req.body.city) req.body.city = req.body.city.trim();
    if (req.body.state) req.body.state = req.body.state.trim();
    if (req.body.zipCode) req.body.zipCode = req.body.zipCode.trim();
    const newDonor = new Donor(req.body);
    await newDonor.save();
    io.emit('donorCountUpdate', await Donor.countDocuments());
    res.status(201).json({ success: true });
});

app.post('/api/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        if (!phone || !password) {
            return res.status(400).json({ success: false, error: 'Phone and password are required.' });
        }
        const donor = await Donor.findOne({ phone });
        if (!donor) {
            return res.json({ success: false, error: 'Invalid credentials' });
        }
        const isMatch = await bcrypt.compare(password, donor.password);
        if (!isMatch) {
            return res.json({ success: false, error: 'Invalid credentials' });
        }
        res.json({ success: true, donor });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const activeOTPs = {};

app.post('/api/forgot-password', async (req, res) => {
    const { phone } = req.body;
    try {
        const donor = await Donor.findOne({ phone });
        if (!donor) {
            return res.status(404).json({ success: false, error: 'Donor not registered with this phone number.' });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store in-memory with 5-minute expiry
        activeOTPs[phone] = {
            otp,
            expiresAt: Date.now() + 5 * 60 * 1000
        };

        // Send OTP via SMS
        const smsResult = await sendSMS(phone, `Your OTP for resetting your Stranger to Friends password is: ${otp}. Valid for 5 minutes.`);
        
        console.log(`🔑 [OTP] Generated OTP ${otp} for ${phone}`);
        res.json({ success: true, message: 'OTP sent successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/reset-password', async (req, res) => {
    const { phone, otp, newPassword } = req.body;
    try {
        const record = activeOTPs[phone];
        if (!record) {
            return res.status(400).json({ success: false, error: 'No OTP requested for this phone number.' });
        }

        if (record.expiresAt < Date.now()) {
            delete activeOTPs[phone];
            return res.status(400).json({ success: false, error: 'OTP has expired. Please request a new one.' });
        }

        if (record.otp !== otp) {
            return res.status(400).json({ success: false, error: 'Invalid OTP. Please try again.' });
        }

        // OTP matches and is valid, update password
        const donor = await Donor.findOne({ phone });
        if (!donor) {
            return res.status(404).json({ success: false, error: 'Donor not found.' });
        }
        
        donor.password = newPassword;
        await donor.save();

        delete activeOTPs[phone];
        res.json({ success: true, message: 'Password reset successful!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/donors/:id', async (req, res) => {
    try {
        const updatedDonor = await Donor.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, donor: updatedDonor });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/donors/search', async (req, res) => {
    const { bloodGroup, city, state, zipCode } = req.query;
    let query = { bloodGroup };
    if (city) query.city = { $regex: new RegExp(flexibleRegex(city), "i") };
    if (state) query.state = { $regex: new RegExp(flexibleRegex(state), "i") };
    if (zipCode) query.zipCode = zipCode.trim();
    
    const donors = await Donor.find(query).select('-password');
    
    const stat = await Stats.findOneAndUpdate({ key: 'bloodRequests' }, { $inc: { value: 1 } }, { upsert: true, new: true });
    io.emit('globalStatsUpdate', { bloodRequests: stat.value });
    res.json(donors);
});


app.get('/api/stats', async (req, res) => {
    const allStats = await Stats.find({});
    const statsObj = { activeDonors: await Donor.countDocuments() };
    allStats.forEach(s => statsObj[s.key] = s.value);
    res.json(statsObj);
});

app.post('/api/messages/send', async (req, res) => {
    try {
        const result = await sendSMS(req.body.donorPhone, req.body.message);
        if (result && result.success) {
            const stat = await Stats.findOneAndUpdate({ key: 'livesSaved' }, { $inc: { value: 1 } }, { upsert: true, new: true });
            io.emit('globalStatsUpdate', { livesSaved: stat.value });
            res.json({ success: true, result });
        } else {
            res.json({ success: false, error: result ? result.error : 'Failed to send SMS', result });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Broadcast SMS to ALL donors in a district matching blood group
app.post('/api/messages/broadcast', async (req, res) => {
    const { bloodGroup, city, state, zipCode, message } = req.body;

    if (!bloodGroup || !message) {
        return res.status(400).json({ success: false, error: 'bloodGroup and message are required.' });
    }

    // Build query to find all matching donors in the district
    let query = { bloodGroup };
    if (city)    query.city    = { $regex: new RegExp(flexibleRegex(city), 'i') };
    if (state)   query.state   = { $regex: new RegExp(flexibleRegex(state), 'i') };
    if (zipCode) query.zipCode = zipCode.trim();

    const donors = await Donor.find(query).select('phone fullName');

    if (donors.length === 0) {
        return res.json({ success: true, sent: 0, total: 0, message: 'No donors found in this district.' });
    }

    // Send SMS to all matching donors (sequentially to avoid rate limits)
    let sentCount = 0;
    for (const donor of donors) {
        try {
            const result = await sendSMS(donor.phone, message);
            if (result && result.success) {
                sentCount++;
                console.log(`📢 [BROADCAST] SMS sent to ${donor.fullName} (${donor.phone})`);
            }
        } catch (err) {
            console.error(`❌ [BROADCAST] Failed to send to ${donor.phone}:`, err.message);
        }
    }

    // Update livesSaved stat
    const stat = await Stats.findOneAndUpdate(
        { key: 'livesSaved' },
        { $inc: { value: sentCount } },
        { upsert: true, new: true }
    );
    io.emit('globalStatsUpdate', { livesSaved: stat.value });

    console.log(`📢 [BROADCAST COMPLETE] Sent ${sentCount}/${donors.length} SMS for blood group ${bloodGroup} in ${city || state || 'district'}`);
    res.json({ success: true, sent: sentCount, total: donors.length });
});


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
