const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Donor = require('./models/Donor');

// Minimal loader for env
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

async function migrate() {
    const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/stranger_to_friends";
    console.log("Connecting to Database for migration...");
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected. Fetching donors...");
        const donors = await Donor.find({});
        console.log(`Found ${donors.length} donors.`);

        let updatedCount = 0;
        for (const donor of donors) {
            // Check if password looks like a bcrypt hash (bcrypt hashes are 60 characters and start with $2a$, $2b$, or $2y$)
            const isHashed = donor.password && donor.password.length === 60 && donor.password.startsWith('$2');
            if (!isHashed) {
                console.log(`Hashing password for donor: ${donor.fullName} (${donor.phone})`);
                const salt = await bcrypt.genSalt(10);
                donor.password = await bcrypt.hash(donor.password, salt);
                await donor.save();
                updatedCount++;
            }
        }
        console.log(`Migration completed successfully. Hashed passwords for ${updatedCount} donors.`);
        process.exit(0);
    } catch (err) {
        console.error("Migration error:", err.message);
        process.exit(1);
    }
}

migrate();
