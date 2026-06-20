const BASE_URL = (window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost:5000') + '/api';

// Global Socket and Call Handling
let socket;
if (typeof io !== 'undefined') {
    socket = io();

    // Check if donor is logged in and should be online
    const donorInfo = JSON.parse(localStorage.getItem('donorInfo'));
    const onlineStatus = localStorage.getItem('isOnline') === 'true';

    if (donorInfo && onlineStatus) {
        socket.emit('donorOnline', donorInfo.phone);
    }

    // Global Stats Updates
    socket.on('globalStatsUpdate', (stats) => {
        if (stats.bloodRequests !== undefined) {
            const el = document.getElementById('bloodRequestCount');
            if (el) el.innerText = stats.bloodRequests;
        }
        if (stats.livesSaved !== undefined) {
            const el = document.getElementById('livesSavedCount');
            if (el) el.innerText = stats.livesSaved;
        }
    });

    socket.on('donorCountUpdate', (count) => {
        const el = document.getElementById('donorCountDisplay');
        if (el) el.innerText = count;
    });

    // Global Incoming Call Handler (Premium Red Theme)
    socket.on('incomingCall', (data) => {
        showIncomingCallModal(data);
    });
}

// Fetch initial stats
fetch(`${BASE_URL}/stats`).then(res => res.json()).then(stats => {
    if (stats.activeDonors !== undefined) {
        const el = document.getElementById('donorCountDisplay');
        if (el) el.innerText = stats.activeDonors;
    }
    if (stats.bloodRequests) document.getElementById('bloodRequestCount').innerText = stats.bloodRequests;
    if (stats.livesSaved) document.getElementById('livesSavedCount').innerText = stats.livesSaved;
}).catch(() => {});


function showIncomingCallModal(data) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('globalIncomingModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'globalIncomingModal';
        modal.style = `
            position: fixed; top: 20px; right: 20px; 
            background: white; padding: 25px; border-radius: 20px;
            box-shadow: 0 15px 40px rgba(0,0,0,0.2);
            border-left: 6px solid #cc0000; z-index: 10000;
            width: 320px; font-family: 'Segoe UI', sans-serif;
            animation: slideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        `;
        document.body.appendChild(modal);

        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes slideIn { from { transform: translateX(120%); } to { transform: translateX(0); } }
            .incoming-btn { cursor: pointer; transition: 0.2s; font-weight: bold; }
            .incoming-btn:hover { transform: scale(1.05); opacity: 0.9; }
        `;
        document.head.appendChild(style);
    }

    modal.style.display = 'block';
    modal.innerHTML = `
        <h3 style="color:#cc0000; margin-bottom:10px; display:flex; align-items:center; gap:10px;">
            <span style="font-size:24px;">📞</span> Incoming Request
        </h3>
        <p style="margin-bottom:20px; color:#444;"><strong>${data.from}</strong> needs blood assistance.</p>
        <div style="display:flex; gap:12px;">
            <button id="acceptCallBtn" class="incoming-btn" style="flex:1; background:#28a745; color:white; border:none; padding:12px; border-radius:10px;">Accept</button>
            <button id="declineCallBtn" class="incoming-btn" style="flex:1; background:#666; color:white; border:none; padding:12px; border-radius:10px;">Decline</button>
        </div>
    `;

    document.getElementById('acceptCallBtn').onclick = () => {
        localStorage.setItem('pendingCall', JSON.stringify(data));
        window.location.href = 'donor-dashboard.html?answer=true';
    };

    document.getElementById('declineCallBtn').onclick = () => {
        modal.style.display = 'none';
    };
}

// Handle Donor Registration (STF2.html) - Optimized
const donorForm = document.getElementById('donorForm');
if (donorForm) {
    donorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = donorForm.querySelector('button');
        submitBtn.disabled = true;
        
        const data = {
            bloodGroup: document.getElementById('regBloodGroup').value,
            fullName: document.getElementById('regFullName').value,
            phone: document.getElementById('regPhone').value,
            password: document.getElementById('regPassword').value,
            city: document.getElementById('regCity').value,
            state: document.getElementById('regState').value,
            zipCode: document.getElementById('regZip').value
        };


        const msgEl = document.getElementById('regMessage');
        msgEl.innerText = 'Registering...';

        try {
            const response = await fetch(`${BASE_URL}/donors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                msgEl.style.color = 'green';
                msgEl.innerText = 'Registration successful!';
                donorForm.reset();
            } else {
                msgEl.style.color = 'red';
                msgEl.innerText = 'Error registering donor.';
            }
        } catch (error) {
            msgEl.innerText = 'Network error.';
        } finally {
            submitBtn.disabled = false;
        }
    });
}

// Handle Login (STF login.html) - Optimized
const loginForm = document.querySelector('form');
if (loginForm && window.location.pathname.includes('login')) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = loginForm.querySelector('input[type="text"]').value;
        const password = loginForm.querySelector('input[type="password"]').value;

        try {
            const response = await fetch(`${BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password })
            });
            const result = await response.json();
            if (result.success) {
                localStorage.setItem('donorInfo', JSON.stringify(result.donor));
                localStorage.setItem('isOnline', 'true'); // Auto-online for speed
                window.location.href = 'donor-dashboard.html';
            } else {
                alert('Invalid credentials');
            }
        } catch (err) {
            alert('Server error');
        }
    });
}

// Handle Blood Search (STF3.html) - FAST SEARCH
const searchForm = document.getElementById('searchForm');
if (searchForm) {
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const resultsEl = document.getElementById('searchResults');
        resultsEl.innerHTML = '<div style="text-align:center; padding:20px;">🔍 Searching for matching donors...</div>';

        const patientName = document.getElementById('patientName').value;
        const bloodGroup = document.getElementById('searchBloodGroup').value;
        const city = document.getElementById('searchCity').value;
        const state = document.getElementById('searchState').value;
        const zipCode = document.getElementById('searchZip').value;
        const hospital = document.getElementById('requestMessage').value;

        try {
            // Save the blood request in the database
            await fetch(`${BASE_URL}/blood-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patientName, bloodGroup, city, state, zipCode, hospital, message: hospital })
            });
        } catch (err) {
            console.error('Error saving blood request:', err);
        }

        try {
            const query = new URLSearchParams({ bloodGroup, city, state, zipCode }).toString();
            const response = await fetch(`${BASE_URL}/donors/search?${query}`);

            const donors = await response.json();

            if (donors.length === 0) {
                resultsEl.innerHTML = '<p style="color:red; text-align:center; padding:20px;">No matching donors found in this area.</p>';
                return;
            }

            // High Performance Fragment Rendering
            const fragment = document.createDocumentFragment();

            // ── Broadcast Banner ──────────────────────────────────────────────
            const broadcastBanner = document.createElement('div');
            broadcastBanner.style.cssText = `
                background: linear-gradient(135deg,#cc0000,#e03030);
                color: white; border-radius: 14px; padding: 16px 20px;
                margin-bottom: 16px; display: flex; justify-content: space-between;
                align-items: center; gap: 12px; box-shadow: 0 4px 15px rgba(204,0,0,0.25);
            `;
            broadcastBanner.innerHTML = `
                <div>
                    <div style="font-weight:700; font-size:15px;">📢 Alert ALL ${donors.length} Donors in ${city || state || 'this district'}</div>
                    <div style="font-size:12px; opacity:0.9; margin-top:3px;">Send one SMS to every matching ${bloodGroup} donor in this district at once</div>
                </div>
                <button id="broadcastBtn"
                    onclick="broadcastSMS('${bloodGroup}','${city}','${state}','${zipCode}')"
                    style="background:white; color:#cc0000; border:none; padding:10px 18px;
                           border-radius:10px; font-weight:700; font-size:13px; cursor:pointer;
                           white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,0.15);">
                    📤 Send to All
                </button>
            `;
            fragment.appendChild(broadcastBanner);
            // ─────────────────────────────────────────────────────────────────

            const title = document.createElement('h3');
            title.innerText = `Found ${donors.length} Matching Donors:`;
            title.style.marginBottom = '15px';
            fragment.appendChild(title);

            donors.forEach(donor => {
                const card = document.createElement('div');
                card.className = 'donor-card';
                card.style = 'display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #eee;';
                card.innerHTML = `
                    <div class="donor-info">
                        <h4>${donor.fullName} <span style="font-size:12px; background:#ffe5e5; padding:2px 6px; border-radius:4px;">${donor.bloodGroup}</span></h4>
                        <p>📍 ${donor.city}, ${donor.state}</p>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="call-btn" style="background:#cc0000; color:white; border:none; padding:8px 15px; border-radius:8px; cursor:pointer;" 
                                onclick="window.open('call.html?phone=${donor.phone}&name=${donor.fullName}', 'STF_Call', 'width=400,height=600')">📞 Call</button>
                        <button class="msg-btn" style="background:#333; color:white; border:none; padding:8px 15px; border-radius:8px; cursor:pointer;" 
                                onclick="openChat('${donor.phone}', '${donor.fullName}')">💬 Message</button>
                    </div>
                `;
                fragment.appendChild(card);
            });


            resultsEl.innerHTML = '';
            resultsEl.appendChild(fragment);
        } catch (error) {
            resultsEl.innerHTML = '<p style="color:red;">Error connecting to server.</p>';
        }
    });
}

// ─── Broadcast SMS to ALL donors in a district ───────────────────────────────
async function broadcastSMS(bloodGroup, city, state, zipCode) {
    // Open a custom message box before sending
    const existingModal = document.getElementById('broadcastModal');
    if (existingModal) existingModal.remove();

    if (!document.getElementById('broadcastModalStyle')) {
        const s = document.createElement('style');
        s.id = 'broadcastModalStyle';
        s.innerHTML = `
            @keyframes bModalIn { from{opacity:0;transform:scale(0.9)} to{opacity:1;transform:scale(1)} }
            #broadcastModal { animation: bModalIn 0.25s ease; }
        `;
        document.head.appendChild(s);
    }

    const overlay = document.createElement('div');
    overlay.id = 'broadcastModal';
    overlay.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.5);
        z-index:20000; display:flex; align-items:center; justify-content:center; padding:20px;
    `;
    overlay.innerHTML = `
        <div style="background:white; border-radius:20px; padding:28px; width:100%; max-width:420px;
                    box-shadow:0 20px 60px rgba(0,0,0,0.3); font-family:'Segoe UI',sans-serif;">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
                <div style="width:44px;height:44px;background:#ffe5e5;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;">📢</div>
                <div>
                    <div style="font-weight:700;font-size:16px;color:#cc0000;">Broadcast Alert</div>
                    <div style="font-size:12px;color:#666;">This message will go to ALL ${bloodGroup} donors in <strong>${city || state || 'this district'}</strong></div>
                </div>
            </div>
            <textarea id="broadcastMsg"
                placeholder="Type your broadcast message here... e.g. URGENT: Need ${bloodGroup} blood at XYZ Hospital, Krishnagiri. Please contact 9XXXXXXXXX."
                maxlength="160" rows="4"
                style="width:100%;padding:12px;border:1.5px solid #ddd;border-radius:12px;
                       font-size:13px;font-family:inherit;resize:none;box-sizing:border-box;"
                oninput="document.getElementById('bCharCount').innerText = 160 - this.value.length + ' chars left'">
            </textarea>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                <span id="bCharCount" style="font-size:11px;color:#999;">160 chars left</span>
                <span style="font-size:11px;color:#888;">Sending to all donors in district</span>
            </div>
            <div style="display:flex;gap:10px;margin-top:16px;">
                <button onclick="document.getElementById('broadcastModal').remove()"
                    style="flex:1;padding:12px;border:1.5px solid #ddd;background:white;border-radius:10px;cursor:pointer;font-size:14px;">Cancel</button>
                <button id="confirmBroadcastBtn"
                    onclick="confirmBroadcast('${bloodGroup}','${city}','${state}','${zipCode}')"
                    style="flex:2;padding:12px;background:#cc0000;color:white;border:none;border-radius:10px;
                           cursor:pointer;font-size:14px;font-weight:700;">📤 Send to All Donors</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('broadcastMsg').focus(), 100);
}

async function confirmBroadcast(bloodGroup, city, state, zipCode) {
    const msgEl = document.getElementById('broadcastMsg');
    const btn = document.getElementById('confirmBroadcastBtn');
    const message = msgEl.value.trim();

    if (!message) {
        msgEl.style.border = '1.5px solid #cc0000';
        msgEl.placeholder = '⚠ Please type your message first!';
        setTimeout(() => { msgEl.style.border = '1.5px solid #ddd'; }, 2000);
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '⏳ Sending to all donors...';

    try {
        const res = await fetch(`${BASE_URL}/messages/broadcast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bloodGroup, city, state, zipCode, message })
        });
        const data = await res.json();

        document.getElementById('broadcastModal').remove();

        // Show result toast
        const toast = document.createElement('div');
        toast.style.cssText = `
            position:fixed; bottom:30px; left:50%; transform:translateX(-50%);
            background:#1b5e20; color:white; padding:14px 28px; border-radius:30px;
            font-size:14px; font-weight:600; z-index:20001;
            box-shadow:0 8px 25px rgba(0,0,0,0.3);
            animation: bModalIn 0.3s ease;
        `;
        toast.innerHTML = `✅ SMS sent to ${data.sent} of ${data.total} donors in the district!`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = '📤 Send to All Donors';
        alert('Network error. Please try again.');
    }
}

// ─── SMS Messenger (Custom Text by Receiver) ────────────────────────────────
function openChat(phone, name) {
    // Remove existing box to refresh for new donor
    const existing = document.getElementById('globalChatBox');
    if (existing) existing.remove();

    // Inject animation styles once
    if (!document.getElementById('chatBoxStyle')) {
        const style = document.createElement('style');
        style.id = 'chatBoxStyle';
        style.innerHTML = `
            @keyframes chatSlideUp {
                from { transform: translateY(60px); opacity: 0; }
                to   { transform: translateY(0);    opacity: 1; }
            }
            #globalChatBox { animation: chatSlideUp 0.3s ease; }
            #chatInput:focus { outline: none; border-color: #cc0000 !important; box-shadow: 0 0 0 2px rgba(204,0,0,0.15); }
            .chip-btn {
                padding: 5px 12px; border-radius: 20px; border: 1px solid #cc0000;
                background: white; color: #cc0000; font-size: 12px; cursor: pointer;
                white-space: nowrap; transition: all 0.2s;
            }
            .chip-btn:hover { background: #cc0000; color: white; }
            #sendSmsBtn { transition: background 0.2s; }
            #sendSmsBtn:hover { background: #aa0000 !important; }
            #sendSmsBtn:disabled { background: #aaa !important; cursor: not-allowed; }
        `;
        document.head.appendChild(style);
    }

    const chatBox = document.createElement('div');
    chatBox.id = 'globalChatBox';
    chatBox.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        background: white; width: 320px; border-radius: 18px;
        box-shadow: 0 15px 40px rgba(0,0,0,0.25); z-index: 10001;
        display: flex; flex-direction: column; overflow: hidden;
        font-family: 'Segoe UI', sans-serif; border: 1px solid #e0e0e0;
    `;

    chatBox.innerHTML = `
        <!-- Header -->
        <div style="background: linear-gradient(135deg,#cc0000,#e03030); color:white; padding:14px 16px; display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:36px;height:36px;background:rgba(255,255,255,0.25);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;">💬</div>
                <div>
                    <div style="font-weight:700; font-size:14px;">SMS to ${name}</div>
                    <div style="font-size:11px; opacity:0.85;">Message will be sent to their phone</div>
                </div>
            </div>
            <button onclick="document.getElementById('globalChatBox').remove()"
                style="background:rgba(255,255,255,0.2); border:none; color:white; width:28px; height:28px; border-radius:50%; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center;">✕</button>
        </div>

        <!-- Message Log -->
        <div id="chatMessages" style="height:180px; overflow-y:auto; padding:14px; font-size:13px; background:#fafafa; display:flex; flex-direction:column; gap:8px;">
            <div style="text-align:center; color:#999; font-size:11px; padding:6px 12px; background:#f0f0f0; border-radius:20px; margin:auto;">
                📱 Type your custom message below and hit Send
            </div>
        </div>

        <!-- Quick Suggestion Chips -->
        <div style="padding:8px 10px; background:#fff3f3; display:flex; gap:6px; overflow-x:auto; border-top:1px solid #f0e0e0;">
            <button class="chip-btn" onclick="setSmsText('URGENT: I need blood! Please help.')">🚨 Urgent Need</button>
            <button class="chip-btn" onclick="setSmsText('Are you available to donate blood today?')">🩸 Availability</button>
            <button class="chip-btn" onclick="setSmsText('Please call me back as soon as possible.')">📞 Call Me</button>
            <button class="chip-btn" onclick="setSmsText('Thank you for registering as a donor!')">🙏 Thank You</button>
        </div>

        <!-- Text Input Area -->
        <div style="padding:10px 12px; background:white; border-top:1px solid #eee;">
            <textarea id="chatInput"
                placeholder="Write your message here... (any text you want)"
                maxlength="160"
                rows="3"
                style="width:100%; padding:10px; border:1.5px solid #ddd; border-radius:10px; font-size:13px;
                       font-family:inherit; resize:none; box-sizing:border-box; line-height:1.4;"
                oninput="document.getElementById('charCount').innerText = 160 - this.value.length + ' chars left'"
                onkeydown="if(event.ctrlKey && event.key==='Enter'){ sendChatMessage('${phone}'); }">
            </textarea>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <span id="charCount" style="font-size:11px; color:#999;">160 chars left</span>
                <button id="sendSmsBtn" onclick="sendChatMessage('${phone}')"
                    style="background:#cc0000; color:white; border:none; padding:9px 20px;
                           border-radius:10px; cursor:pointer; font-size:13px; font-weight:600; display:flex; align-items:center; gap:6px;">
                    📤 Send SMS
                </button>
            </div>
            <div style="text-align:center; font-size:10px; color:#bbb; margin-top:4px;">Ctrl + Enter to send quickly</div>
        </div>
    `;

    document.body.appendChild(chatBox);
    setTimeout(() => document.getElementById('chatInput').focus(), 100);
}

function setSmsText(text) {
    const input = document.getElementById('chatInput');
    if (input) {
        input.value = text;
        input.focus();
        document.getElementById('charCount').innerText = (160 - text.length) + ' chars left';
    }
}

async function sendChatMessage(phone) {
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendSmsBtn');
    const message = input.value.trim();

    if (!message) {
        input.style.border = '1.5px solid #cc0000';
        input.placeholder = '⚠ Please write a message first!';
        setTimeout(() => {
            input.style.border = '1.5px solid #ddd';
            input.placeholder = 'Write your message here...';
        }, 2000);
        return;
    }

    // Disable button while sending
    sendBtn.disabled = true;
    sendBtn.innerHTML = '⏳ Sending...';

    const chatMessages = document.getElementById('chatMessages');

    // Show sent bubble
    const myMsg = document.createElement('div');
    myMsg.style.cssText = 'background:#cc0000; color:white; padding:8px 12px; border-radius:14px 14px 4px 14px; font-size:13px; max-width:85%; align-self:flex-end;';
    myMsg.innerHTML = `<div>${message}</div><div style="font-size:10px;opacity:0.75;margin-top:3px;">You • Just now</div>`;
    chatMessages.appendChild(myMsg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    input.value = '';
    document.getElementById('charCount').innerText = '160 chars left';

    try {
        const res = await fetch(`${BASE_URL}/messages/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ donorPhone: phone, message, senderName: 'Recipient' })
        });

        const data = await res.json();
        const statusMsg = document.createElement('div');
        statusMsg.style.cssText = 'text-align:center; font-size:11px; color:#4caf50; padding:4px 8px; background:#f0fff0; border-radius:20px; align-self:center;';

        if (res.ok && data.success) {
            const provider = data.result && data.result.provider ? ` via ${data.result.provider}` : '';
            statusMsg.innerHTML = `✅ SMS delivered${provider}`;
        } else {
            statusMsg.style.color = '#f44336';
            statusMsg.style.background = '#fff0f0';
            statusMsg.innerHTML = `❌ Could not send SMS. Try again.`;
        }
        chatMessages.appendChild(statusMsg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (err) {
        const errMsg = document.createElement('div');
        errMsg.style.cssText = 'text-align:center; font-size:11px; color:#f44336;';
        errMsg.innerText = '❌ Network error. Please check connection.';
        chatMessages.appendChild(errMsg);
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '📤 Send SMS';
        input.focus();
    }
}
