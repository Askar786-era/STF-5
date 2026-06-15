const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const Donor = require('./models/Donor');
const Stats = require('./models/Stats');
const BloodRequest = require('./models/BloodRequest');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const onlineDonors = {}; 

// SMS Gateway Integration (Fast2SMS & Twilio)
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;

async function sendSMS(to, body) {
    // 1. Fast2SMS (Indian Gateway)
    if (FAST2SMS_API_KEY) {
        try {
            let cleanPhone = to.replace(/\D/g, '');
            if (cleanPhone.length > 10) {
                cleanPhone = cleanPhone.slice(-10);
            }
            
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
            }
        } catch (err) {
            console.error(`❌ Error in Fast2SMS send:`, err.message);
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
                return { success: false, error: data.message };
            }
        } catch (err) {
            console.error(`❌ Error in Twilio send:`, err.message);
            return { success: false, error: err.message };
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

// Database Connection — Uses Atlas (MONGODB_URI env var) on Render, falls back to local for dev
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/stranger_to_friends";

mongoose.connect(MONGODB_URI)
    .then(async () => {
        const dbType = process.env.MONGODB_URI ? "☁️ MongoDB Atlas" : "💻 Local MongoDB";
        console.log(`✅ SUCCESS: Connected to ${dbType}!`);
        const stats = ['bloodRequests', 'livesSaved'];
        for (const key of stats) {
            await Stats.findOneAndUpdate({ key }, { $setOnInsert: { value: 0 } }, { upsert: true });
        }
    })
    .catch(err => {
        console.error("❌ CONNECTION ERROR:", err.message);
        console.log("TIP: Try switching to a Mobile Hotspot if your WiFi blocks MongoDB.");
    });

io.on('connection', (socket) => {
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
    });



    // Call Signaling
    socket.on('callUser', async ({ donorPhone, signalData, callerName }) => {
        const donor = await Donor.findOne({ phone: donorPhone });
        if (donor && donor.isOnline && donor.socketId) {
            io.to(donor.socketId).emit('incomingCall', { signal: signalData, from: callerName, callerSocket: socket.id });
        } else if (donor) {
            // Donor is offline - Send real SMS Notification
            await sendSMS(donorPhone, `URGENT BLOOD ALERT: ${callerName} needs your help! Please log in to Stranger to Friends immediately to accept the call.`);
            socket.emit('callError', { message: 'Donor is offline. An urgent SMS notification has been sent to them!' });
        } else {
            socket.emit('callError', { message: 'Donor not found.' });
        }
    });


    socket.on('answerCall', (data) => io.to(data.to).emit('callAccepted', { signal: data.signal, donorSocket: socket.id }));
    socket.on('iceCandidate', (data) => io.to(data.to).emit('iceCandidate', data.candidate));
});

// API Routes
app.post('/api/blood-requests', async (req, res) => {
    try {
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
        if (city) query.city = { $regex: new RegExp(city, "i") };
        if (state) query.state = { $regex: new RegExp(state, "i") };
        
        const requests = await BloodRequest.find(query).sort({ createdAt: -1 });
        res.json(requests);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/donors', async (req, res) => {
    const newDonor = new Donor(req.body);
    await newDonor.save();
    io.emit('donorCountUpdate', await Donor.countDocuments());
    res.status(201).json({ success: true });
});

app.post('/api/login', async (req, res) => {
    const donor = await Donor.findOne(req.body);
    res.json({ success: !!donor, donor });
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
    if (city) query.city = { $regex: new RegExp(city, "i") };
    if (state) query.state = { $regex: new RegExp(state, "i") };
    if (zipCode) query.zipCode = zipCode;
    
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
    const result = await sendSMS(req.body.donorPhone, req.body.message);
    const stat = await Stats.findOneAndUpdate({ key: 'livesSaved' }, { $inc: { value: 1 } }, { upsert: true, new: true });
    io.emit('globalStatsUpdate', { livesSaved: stat.value });
    res.json({ success: true, result });
});

// Broadcast SMS to ALL donors in a district matching blood group
app.post('/api/messages/broadcast', async (req, res) => {
    const { bloodGroup, city, state, zipCode, message } = req.body;

    if (!bloodGroup || !message) {
        return res.status(400).json({ success: false, error: 'bloodGroup and message are required.' });
    }

    // Build query to find all matching donors in the district
    let query = { bloodGroup };
    if (city)    query.city    = { $regex: new RegExp(city, 'i') };
    if (state)   query.state   = { $regex: new RegExp(state, 'i') };
    if (zipCode) query.zipCode = zipCode;

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
