const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const phoneFormatter = require('./utils/phoneFormatter');
const multer = require('multer');
const aiService = require('./ai-service');
const { initScheduler, setCampaignPaused, setCampaignCancelled, getActiveExecutionState } = require('./scheduler');
const schedulerBus = require('./schedulerBus');
const CampaignService = require('./campaign-service');
const vectorService = require('./vector-service');
const { execSync } = require('child_process');
const crypto = require('crypto');
require('dotenv').config();

process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] 💥 Uncaught Exception in server.js:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] 💥 Unhandled Rejection in server.js:', reason);
});

// Configure Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
global.io = io; // Make io accessible globally for db.js and other modules

let waStatus = { state: 'disconnected', data: null, error: null };

const debugLog = (msg) => {
    try { fs.appendFileSync(path.join(__dirname, 'debug.log'), `[${new Date().toISOString()}] ${msg}\n`); } catch (e) { }
};

const isCurrentlyTransferred = (notes) => {
    if (!notes) return false;
    const lastTransfer = notes.lastIndexOf('[Transferred]');
    const lastRestore = notes.lastIndexOf('[Debt Restored]');
    return lastTransfer > -1 && lastTransfer > lastRestore;
};

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// PRODUCTION-GRADE: Proactive Memory Management Pulse
setInterval(() => {
    if (global.gc) {
        const startMem = Math.round(process.memoryUsage().rss / 1024 / 1024);
        global.gc();
        const endMem = Math.round(process.memoryUsage().rss / 1024 / 1024);
        console.log(`[Pulse] 🧠 RAM Cleared: ${startMem}MB -> ${endMem}MB`);
    }
}, 1000 * 60 * 30); // Every 30 minutes

const { cancelledProcesses, pausedProcesses } = require('./processManager');
const campaignService = new CampaignService(io, db, cancelledProcesses, pausedProcesses);

// Glue: Pipe events from schedulerBus to Socket.io for services that can't access 'io' directly
schedulerBus.on('service_event', (data) => {
    io.emit(data.event, data.payload);
});

// Process Control Endpoints
app.patch('/api/processes/:id/cancel', async (req, res) => {
    const id = String(req.params.id);
    cancelledProcesses.set(id, true);
    campaignService.cancelProcess(id); // Notify campaign service
    setCampaignCancelled(id, db).catch(() => { }); // Also notify scheduler if it's a scheduled execution

    // Sync DB status for scheduled campaigns
    await db.cancelScheduledCampaign(id).catch(() => { });

    try {
        await db.removeActiveExecution(id);
    } catch (err) { }

    io.emit('scheduled_campaigns_changed');
    res.json({ success: true, message: `Process ${id} marked for cancellation` });
});

app.patch('/api/processes/:id/pause', async (req, res) => {
    try {
        const id = String(req.params.id);
        if (pausedProcesses.has(id)) {
            return res.json({ success: true, message: 'Already paused' });
        }
        pausedProcesses.set(id, true);
        setCampaignPaused(id, true); // Notify scheduler engine
        await db.updateActiveExecutionProgress(id, null, 'paused').catch(() => { });
        await db.toggleScheduledCampaignPause(id, true).catch(() => { }); // Persist to DB if scheduled

        io.emit('scheduled_campaigns_changed');
        io.emit('execution_state_changed', { campaignId: id, state: 'paused' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/processes/:id/resume', async (req, res) => {
    try {
        const id = String(req.params.id);

        // 1. In-memory update
        pausedProcesses.delete(id);
        setCampaignPaused(id, false); // Notify scheduler engine

        // 2. DB Update for Active Executions (Instant/Running)
        const allExecutions = await db.getActiveExecutions().catch(() => []);
        const exe = allExecutions.find(e => e.id === id);
        if (exe) {
            await db.updateActiveExecutionProgress(id, exe.current_index, 'running').catch(() => null);
        }

        // 3. DB Update for Scheduled Campaigns (Pending/Countdown)
        await db.toggleScheduledCampaignPause(id, false).catch(() => { });

        io.emit('scheduled_campaigns_changed');
        io.emit('execution_state_changed', { campaignId: id, state: 'running' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Enterprise Outbox Dispatcher (Background Worker) ────────────────
const startOutboxWorker = () => {
    console.log('[Outbox] Starting Background Dispatcher...');
    
    // Recovery: On startup, reset any 'sending' status messages to 'pending'
    db.resetStaleOutbox().then(res => {
        if (res.changes > 0) console.log(`[Outbox] 🩹 Recovered ${res.changes} stalled messages.`);
    }).catch(e => console.error('[Outbox] Recovery failed:', e));

    setInterval(async () => {
        // Only dispatch if service is READY
        if (waStatus.state !== 'ready') return;

        try {
            const pending = await db.getPendingFromOutbox(5); // Process in small batches
            if (pending.length === 0) return;

            console.log(`[Outbox] 📦 Dispatching batch of ${pending.length} pending messages...`);

            for (const item of pending) {
                // --- SANITY CHECK: MALFORMED JID GUARD ---
                if (!item.chat_id || item.chat_id === '@c.us' || item.chat_id === '@g.us') {
                    console.warn(`[Outbox] ⚠️ Skipping malformed entry ${item.id}: Invalid chat_id='${item.chat_id}'`);
                    await db.updateOutboxStatus(item.id, 'failed', 'Malformed Chat ID (Empty Number)');
                    continue;
                }

                // Mark as sending to prevent duplicate dispatch in next interval
                await db.updateOutboxStatus(item.id, 'sending');

                const mediaPayload = item.media_payload ? JSON.parse(item.media_payload) : null;
                const options = item.options ? JSON.parse(item.options) : {};
                const metadata = item.metadata ? JSON.parse(item.metadata) : {};

                let targetChatId = item.chat_id;
                if (phoneFormatter.isLid(targetChatId)) {
                    const pureDigits = targetChatId.split('@')[0].replace(/[^\d]/g, '');
                    targetChatId = `${pureDigits}@lid`;
                }

                io.emit('service_send_message', {
                    chatId: targetChatId,
                    text: item.text,
                    mediaPath: mediaPayload?.url || null,
                    mediaType: mediaPayload?.type || null,
                    options: options,
                    queueId: item.id, // THE ANCHOR: Service MUST return this
                    to: metadata.customer_number || item.chat_id.split('@')[0],
                    contactName: metadata.contactName || 'Customer'
                });
            }
        } catch (err) {
            console.error('[Outbox Worker Error]', err);
        }
    }, 4000); // Check every 4 seconds
};

if (process.env.NODE_ENV !== 'test') {
    startOutboxWorker();
}

/**
 * AI Configuration Recovery Worker (Persistence Guard)
 * Automatically resets 'limit_exceeded' and 'error' flags to 'active' 
 * periodically to allow the system to recover from transient outages.
 */
const startAIConfigRecoveryWorker = () => {
    // Initial reset on startup
    db.resetStaleAIConfigs().catch(e => console.error('[AI Recovery] Startup reset error:', e));

    setInterval(async () => {
        try {
            const result = await db.resetStaleAIConfigs();
            if (result.changes > 0) {
                console.log(`[AI Recovery] 🔄 Automatically re-enabled ${result.changes} AI configurations.`);
            }
        } catch (err) {
            console.error('[AI Recovery Worker Error]', err);
        }
    }, 30 * 60000); // Check every 30 minutes
};

if (process.env.NODE_ENV !== 'test') {
    startAIConfigRecoveryWorker();
}

/**
 * AI Generation Retry Worker (Business Continuity)
 * Picks up failed AI generation tasks from the queue and retries them.
 * This ensures no customer message goes unanswered due to temporary AI outages.
 */
const recoverUnrepliedMessages = async () => {
    try {
        const profile = await db.getBusinessProfile();
        if (!profile || profile.ai_auto_reply_enabled !== 'true') return;

        const unreplied = await db.getUnrepliedIncomingMessages(24);
        if (!unreplied || unreplied.length === 0) return;

        console.log(`[Offline-Recovery] 🔄 Found ${unreplied.length} un-replied customer messages. Processing recovery...`);

        for (const msg of unreplied) {
            const customerNumber = msg.number;
            const text = msg.text;

            // 🛡️ Guard 1: Skip if human agent manually replied since customer message
            const hasReplied = await db.hasRepliedSince(customerNumber, msg.timestamp);
            if (hasReplied) {
                console.log(`[Offline-Recovery] 🛑 Skipping ${customerNumber}. Manual reply detected.`);
                continue;
            }

            // 🛡️ Guard 2: Skip if task is already in queue
            const isQueued = await db.isAIRetryQueuedForNumber(customerNumber);
            if (isQueued) continue;

            console.log(`[Offline-Recovery] ⚡ Auto-queuing recovery task for ${customerNumber}: "${text.substring(0, 30)}..."`);
            
            const enhancedContext = await db.getEnhancedConversationContext(customerNumber, 10);
            
            await db.addAIRetryTask(
                customerNumber,
                text,
                {
                    context: enhancedContext.fullContext,
                    history: enhancedContext.fullContext,
                    userMessage: text,
                    businessName: profile.company_name,
                    customerNumber: customerNumber,
                    receivedAt: msg.timestamp,
                    notifyName: msg.contact_name || 'Customer'
                }
            );
        }
    } catch (e) {
        console.error('[Offline-Recovery Error]', e.message);
    }
};

const startAIRetryWorker = () => {
    // Initial startup reset and unreplied recovery scan
    db.resetStaleAIRetryTasks()
        .then(() => recoverUnrepliedMessages())
        .catch(e => console.error('[AI-Retry] Startup reset error:', e));

    setInterval(async () => {
        // Periodically check for unreplied offline messages
        await recoverUnrepliedMessages();

        try {
            const pendingTasks = await db.getPendingAIRetryTasks(5);
            if (!pendingTasks || pendingTasks.length === 0) return;

            console.log(`[AI-Retry-Worker] 🔄 Attempting recovery for ${pendingTasks.length} pending AI tasks...`);

            for (const task of pendingTasks) {
                try {
                    // Mark as processing to handle concurrent workers/restarts
                    await db.updateAIRetryStatus(task.id, 'processing');

                    const payload = JSON.parse(task.payload);
                    const { context, history, userMessage, businessName, customerNumber, receivedAt } = payload;

                    // 🛡️ SUPER HYBRID GUARD: Check if human already replied manually
                    if (receivedAt) {
                        const hasReplied = await db.hasRepliedSince(customerNumber, receivedAt);
                        if (hasReplied) {
                            console.log(`[AI-Hybrid] 🛑 Skipping retry for ${customerNumber}. Manual reply detected.`);
                            await db.deleteAIRetryTask(task.id);
                            continue;
                        }
                    }

                    // Execute AI generation
                    const aiResult = await aiService.generateAutoReply({
                        context,
                        history,
                        userMessage,
                        businessName,
                        customerNumber
                    });

                    if (aiResult && aiResult.reply) {
                        const cleanNumber = phoneFormatter.formatNumber(customerNumber);
                        const chatId = `${cleanNumber}@c.us`;

                        // Queue to Outbox (Standard Delivery)
                        await db.addOutgoingQueue(chatId, aiResult.reply, null, {}, {
                            customer_number: cleanNumber,
                            contactName: payload.notifyName || 'Customer',
                            isRecovered: true
                        });

                        // Mark as completed (Delete from queue)
                        await db.deleteAIRetryTask(task.id);
                        console.log(`[AI-Retry-Worker] ✅ Successfully recovered reply for ${customerNumber}`);
                    }
                } catch (taskErr) {
                    console.error(`[AI-Retry-Worker] ❌ Retry failed for task ${task.id}:`, taskErr.message);
                    await db.updateAIRetryStatus(task.id, 'failed', taskErr.message);
                }
            }
        } catch (err) {
            console.error('[AI-Retry-Worker Internal Error]', err);
        }
    }, 2 * 60000); // Check every 2 minutes
};

if (process.env.NODE_ENV !== 'test') {
    startAIRetryWorker();
}

/**
 * POST /api/campaigns/run-instant
 * Starts a server-side mass campaign.
 * Body: { targets: Contact[], text: string, attachments: [], templateId: number }
 */
const idempotencyCache = new Map();

app.post('/api/campaigns/run-instant', (req, res) => {
    const { targets, text, attachments, templateId, delayMin, delayMax, executionWindows, respectExecutionWindows } = req.body;

    // Quick Hash for Request Lock (Prevents double-clicks)
    const reqHash = `launch_${req.ip}_${targets?.length}_${text?.substring(0, 20)}`;
    if (idempotencyCache.has(reqHash)) {
        return res.status(429).json({ error: 'Duplicate request detected. Please wait.', success: false });
    }
    idempotencyCache.set(reqHash, true);
    setTimeout(() => idempotencyCache.delete(reqHash), 3000);

    if (!targets || !Array.isArray(targets) || targets.length === 0) {
        return res.status(400).json({ error: 'targets array is required' });
    }
    const processId = `instant_campaign_${Date.now()}`;

    // Start background process
    campaignService.runInstantCampaign(processId, {
        targets,
        text,
        attachments,
        templateId,
        delayMin,
        delayMax,
        executionWindows,
        respectExecutionWindows
    });

    res.json({ success: true, processId });
});

app.get('/api/system/status', (req, res) => {
    res.json({
        success: true,
        whatsapp: waStatus.state, // 'initial', 'ready', 'qr', etc.
        timestamp: new Date().toISOString()
    });
});

// ── Unified Campaign Tracker APIs ──────────────────────────────────────────

app.get('/api/campaigns', async (req, res) => {
    try {
        const campaigns = await db.getAllCampaigns();
        res.json({ success: true, campaigns });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/campaigns/:id/details', async (req, res) => {
    try {
        const campaignId = req.params.id;
        const messages = await db.getCampaignMessages(campaignId);

        // Ensure accurate breakdown
        const sent = messages.filter(m => ['sent', 'delivered', 'read'].includes(m.status));
        const failed = messages.filter(m => m.status.startsWith('error'));
        // Include pending or unknown as well if necessary

        res.json({ success: true, messages, summary: { total: messages.length, sent: sent.length, failed: failed.length } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/campaigns/:id/resend', async (req, res) => {
    try {
        const campaignId = req.params.id;

        // Quick Hash for Request Lock (Prevents double-clicks triggering dual db wipe)
        const reqHash = `resend_${req.ip}_${campaignId}`;
        if (idempotencyCache.has(reqHash)) {
            return res.status(429).json({ error: 'Duplicate resend request detected. Please wait.', success: false });
        }
        idempotencyCache.set(reqHash, true);
        setTimeout(() => idempotencyCache.delete(reqHash), 5000); // 5s lock for DB heavy lifting

        // Fetch the campaign to get template, message, delays etc
        const campaigns = await db.getAllCampaigns();
        const campaign = campaigns.find(c => String(c.id) === String(campaignId));

        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        // Fetch failed messages
        const messages = await db.getCampaignMessages(campaignId);
        const failedNumbers = messages.filter(m => m.status.startsWith('error')).map(m => m.number);

        if (failedNumbers.length === 0) {
            return res.json({ success: false, message: 'No failed messages found to resend.' });
        }

        // Clean up historic failures to prevent duplicate entries before processing
        await db.clearFailedMessagesAndDecrementCount(campaignId, failedNumbers.length);

        // Reconstruct targets for the engine
        const targets = failedNumbers.map(num => ({ name: 'Unknown', number: num, phone: num }));

        // Re-use logic from run-instant-campaign
        const processId = `resend_campaign_${Date.now()}`;

        // Determine attachments based on template usage
        let attachments = [];
        let text = campaign.message;

        // Call the service to run only for failed numbers
        campaignService.runInstantCampaign(processId, {
            targets,
            text,
            attachments,
            templateId: campaign.template_id,
            delayMin: campaign.delayMin,
            delayMax: campaign.delayMax,
            executionWindows: campaign.execution_windows ? JSON.parse(campaign.execution_windows) : [],
            respectExecutionWindows: Boolean(campaign.respect_execution_windows),
            resyncCampaignId: campaign.id // Pass back the original campaign ID to append updates to the same campaign
        });

        res.json({ success: true, processId, resentCount: targets.length });
    } catch (err) {
        console.error('Smart Resend Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Calculate SHA-256 hash of a file
 */
const getFileHash = (filePath) => {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (err) => reject(err));
    });
};

// Upload Endpoint with Single Instance Storage (SIS)
app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
        const filePath = req.file.path;
        const fileHash = await getFileHash(filePath);

        // Check if file already exists in SIS
        const existingAsset = await db.getAssetByHash(fileHash);
        if (existingAsset) {
            console.log(`[SIS] Duplicate file detected (${fileHash}). Reusing existing asset: ${existingAsset.url}`);
            // Delete the duplicate file just uploaded
            fs.unlinkSync(filePath);
            return res.json({
                url: existingAsset.url,
                filename: existingAsset.filename,
                mimetype: existingAsset.type,
                isDuplicate: true
            });
        }

        // Save new asset to DB
        const fileUrl = `/uploads/${req.file.filename}`;
        await db.saveAsset({
            hash: fileHash,
            url: fileUrl,
            type: req.file.mimetype,
            filename: req.file.filename,
            is_protected: 0
        });

        res.json({
            url: fileUrl,
            filename: req.file.filename,
            mimetype: req.file.mimetype,
            isDuplicate: false
        });
    } catch (err) {
        console.error('[Upload] SIS Error:', err);
        // Fallback to normal upload response if SIS fails
        res.json({
            url: `/uploads/${req.file.filename}`,
            filename: req.file.filename,
            mimetype: req.file.mimetype
        });
    }
});

// Backend Proxy for IP Geolocation to bypass Browser cors/adblock
app.get('/api/location', async (req, res) => {
    try {
        let lat, lng;
        // Try Primary
        try {
            const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
            const r1 = await fetch('https://ipwho.is/');
            const d1 = await r1.json();
            if (d1.success && d1.latitude && d1.longitude) {
                lat = d1.latitude;
                lng = d1.longitude;
            }
        } catch (e) { }

        // Try Secondary
        if (!lat || !lng) {
            try {
                const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
                const r2 = await fetch('https://get.geojs.io/v1/ip/geo.json');
                const d2 = await r2.json();
                if (d2.latitude && d2.longitude) {
                    lat = d2.latitude;
                    lng = d2.longitude;
                }
            } catch (e) { }
        }

        if (lat && lng) {
            return res.json({ success: true, latitude: lat, longitude: lng });
        } else {
            return res.status(500).json({ success: false, error: 'All location providers failed' });
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Internal communication with WA-Service
io.on('connection', async (socket) => {
    console.log('Socket Client connected:', socket.id);

    // Initial status for Dashboard and all new clients
    socket.emit('status_update', waStatus);
    if (waStatus.state === 'qr' && waStatus.data) socket.emit('qr', waStatus.data);

    // Emit active persistent executions for Floating Controller
    try {
        const actives = await db.getActiveExecutions();
        if (actives.length > 0) {
            socket.emit('active_executions_sync', actives);
        }
    } catch (e) { }

    // Professional Auto-Connect Sync: Fetch last known account from DB
    try {
        const account = await db.getConnectedAccount();
        if (account) {
            // Merge account info into status if it's missing but we have it in DB
            if (!waStatus.accountInfo && (waStatus.state === 'ready' || waStatus.state === 'authenticated')) {
                waStatus.accountInfo = account;
                socket.emit('status_update', waStatus);
            }
        }
    } catch (e) { }

    // Manual status request
    socket.on('get_status', () => {
        socket.emit('status_update', waStatus);
        if (waStatus.state === 'qr' && waStatus.data) socket.emit('qr', waStatus.data);
    });

    // --- FROM WA-SERVICE ---
    socket.on('service_account_info', async (data) => {
        console.log(`[Hub] Received Account Info: ${data.name} (${data.number})`);
        waStatus.accountInfo = data;
        try {
            await db.updateConnectedAccount(data);
        } catch (err) {
            console.error('[Hub] DB Error saving account info:', err.message);
        }
        io.emit('status_update', waStatus);
    });

    socket.on('service_status_update', (data) => {
        socket.isWaService = true;
        console.log(`[Hub] Service Status Update: ${data.state}`);
        
        // Preserve accountInfo if not provided in the update
        const currentAccount = waStatus.accountInfo;
        waStatus = { ...data };
        if (!waStatus.accountInfo) waStatus.accountInfo = currentAccount;

        if (data.state === 'error') {
            waStatus.error = data.data || 'Unknown Service Error';
        } else {
            waStatus.error = null;
        }

        io.emit('status_update', waStatus);
        if (data.state === 'qr') io.emit('qr', data.data);
        if (data.state === 'ready') io.emit('ready');
    });

    socket.on('update_campaign_content', async (data) => {
        const { id, campaignId, text } = data;
        console.log(`[Hub] Live Update Request: id=${id}, campaignId=${campaignId}, textLength=${text?.length}`);

        if (id) {
            // Instant Campaign
            campaignService.updateActiveContent(id, text);
        } else if (campaignId) {
            // Scheduled Campaign
            const { updateScheduledContent } = require('./scheduler');
            updateScheduledContent(campaignId, text);
        }

        io.emit('campaign_content_updated', { id, campaignId, text });
    });

    socket.on('disconnect', () => {
        console.log('Socket Client disconnected:', socket.id);
        if (socket.isWaService) {
            console.log('[Hub] WA-Service socket closed. Waiting for heartbeat/reconnect...');
            // Don't immediately reset to initial, wait a bit for potential reconnection
            setTimeout(() => {
                if (waStatus.state !== 'ready' && waStatus.state !== 'authenticated') {
                    // Check if it's still disconnected after 5s
                    // This prevents UI flicker during service restarts
                }
            }, 5000);
        }
    });



    socket.on('service_new_message', async (data) => {
        const { from, text, whatsappId, media, notifyName, quotedMsg, metadata } = data;
        let mediaPath = null;
        let mediaType = null;

        if (media) {
            const tempFileName = `temp_${Date.now()}_${media.filename}`;
            const tempPath = path.join(__dirname, 'uploads', tempFileName);
            fs.writeFileSync(tempPath, media.data, 'base64');

            try {
                const fileHash = await getFileHash(tempPath);
                const existingAsset = await db.getAssetByHash(fileHash);

                if (existingAsset) {
                    console.log(`[SIS] Incoming duplicate detected. Reusing: ${existingAsset.url}`);
                    fs.unlinkSync(tempPath);
                    mediaPath = existingAsset.url;
                } else {
                    const finalPath = path.join(__dirname, 'uploads', media.filename);
                    fs.renameSync(tempPath, finalPath);
                    mediaPath = `/uploads/${media.filename}`;
                    await db.saveAsset({
                        hash: fileHash,
                        url: mediaPath,
                        type: media.mimetype,
                        filename: media.filename
                    });
                }
            } catch (e) {
                console.error('[SIS] Incoming Hash Error:', e);
                mediaPath = `/uploads/${tempFileName}`; // Fallback to temp if hashing fails
            }
            mediaType = media.mimetype;
        }

        const timestamp = new Date().toISOString();

        // 🔒 GUARD 1.5: Reject Non-Numeric or Malformed Senders (Prevents @c.us loop)
        const cleanFrom = phoneFormatter.formatNumber(from);
        if (!cleanFrom || from === 'status@broadcast') {
            return; // Silently ignore non-customer senders
        }

        // Smart Sync: Automagically save/update customer
        try {
            await db.syncCustomer(notifyName, cleanFrom);
        } catch (syncErr) {
            console.error('[Hub] Sync Error:', syncErr.message);
        }

        const savedMsg = await db.addMessage(cleanFrom, text, timestamp, 'received', 'received', whatsappId, mediaPath, mediaType, null, quotedMsg, metadata);

        // Track Response in Analytics
        try {
            await db.recordTemplateResponse(cleanFrom);
            io.emit('analytics_update', { type: 'response', number: cleanFrom });
        } catch (resErr) {
            console.error('[Hub] Analytics Response Error:', resErr);
        }

        io.emit('new_message', {
            id: savedMsg.id,
            number: cleanFrom,
            text,
            timestamp,
            status: 'received',
            type: 'received',
            contactName: notifyName || 'Unknown',
            whatsapp_id: whatsappId,
            media_path: mediaPath,
            media_type: mediaType,
            quotedMsg: quotedMsg,
            metadata: metadata
        });

        /* AI ULTRA-HYBRID RAG Auto Reply Hook */
        try {
            const profile = await db.getBusinessProfile();
            const aiStatus = await db.getCustomerAIStatus(cleanFrom);

            // 🔒 GUARD 1: Global and Customer-specific AI status checks
            const isAIEnabled = profile.ai_auto_reply_enabled === 'true';
            const isCustomerPaused = aiStatus.ai_paused === 1;

            if (isAIEnabled && !isCustomerPaused && text && !from.includes('@g.us')) {
                // 🔒 GUARD 2: Specific keyword check for MANUAL handover request
                const isHandoverRequested = /(talk to human|agent|মানুষ|অধিকার|মালিক|human|customer care)/i.test(text);
                
                if (isHandoverRequested) {
                    await db.updateCustomerAIStatusByNumber(from, { handover_requested: 1 });
                    io.emit('handover_alert', { number: from, name: notifyName });
                }

                if (!isHandoverRequested) {
                    const languageNeutralParser = require('./utils/languageNeutralParser');
                    const queryAnalysis = languageNeutralParser.analyzeQueryIntent(text);

                    // 🛡️ GUARD 2.5: Silently ignore internal system tasks (e.g. 'Task: auto_reply')
                    if (queryAnalysis.isSystemTask) {
                        console.log(`[Hub] 🛑 Internal system task string ignored: "${text.substring(0, 30)}"`);
                        return;
                    }

                    const queryLower = text.trim().toLowerCase();
                    const normalizedQuery = queryLower
                        .replace(/[?।!]/g, '')
                        .replace(/\s+/g, ' ');

                    const queryHash = crypto.createHash('sha256').update(normalizedQuery).digest('hex');
                    let cachedResponse = null;
                    let aiResult = null;
                    let queryEmbedding = null;

                    // Layer 1: Exact Cache Check
                    try {
                        cachedResponse = await db.getCachedAIResponse(queryHash);
                    } catch(e) {}

                    // Fetch Dynamic Cache Settings
                    let semanticThresholdVal = 0.95;
                    try {
                        const thresholdSetting = await db.getSetting('cache_similarity_threshold');
                        if (thresholdSetting) semanticThresholdVal = parseFloat(thresholdSetting);
                    } catch (e) {}

                    // Step 1: Fetch Enhanced Context (Summary + Last 10 Raw Messages)
                    const enhancedContext = await db.getEnhancedConversationContext(from, 10);

                    // Layer 2: Universal Vector Semantic Cache Check (Active for ALL messages, no rawCount limit!)
                    if (!cachedResponse && !queryAnalysis.isDynamicMath && !queryAnalysis.isContextDependent) {
                        try {
                            queryEmbedding = await vectorService.generateEmbedding(normalizedQuery);
                            const semanticHit = await vectorService.getSemanticCachedResponse(text, null, 'default', queryEmbedding);
                            if (semanticHit) {
                                cachedResponse = { response_text: typeof semanticHit === 'string' ? semanticHit : JSON.stringify(semanticHit) };
                            }
                        } catch(e) { console.error('[Cache] Semantic Error:', e.message); }
                    }

                    if (cachedResponse) {
                        console.log(`[Cache Hit] 🎯 Fast AI Cache Response served for: "${text.substring(0, 30)}..."`);
                        try {
                            const parsedHit = JSON.parse(cachedResponse.response_text);
                            aiResult = {
                                reply: parsedHit.reply || cachedResponse.response_text,
                                handover: false,
                                action: null,
                                intel: parsedHit.intel || null,
                                cached: true
                            };
                        } catch(e) {
                            aiResult = { reply: cachedResponse.response_text, handover: false, action: null, cached: true };
                        }
                    } else {
                        // Layer 3: Full AI Generation (Reuse queryEmbedding!)
                        const contextStr = await vectorService.getUnifiedContextWithEmb(text, from, queryEmbedding);

                        // Step 3: Generate Smart Reply
                        aiResult = await aiService.generateAutoReply({
                            context: contextStr,
                            history: enhancedContext.fullContext,
                            userMessage: text,
                            businessName: profile.company_name,
                            customerNumber: from
                        });

                        // Save to Cache if it's a static FAQ browsing query
                        if (aiResult && aiResult.reply && !aiResult.action && queryAnalysis.isStaticFAQ) {
                            try {
                                const detectedIntent = aiResult.detected_intent || (aiResult.intel ? aiResult.intel.detected_intent : 'GENERAL');
                                await vectorService.setSemanticCachedResponse(text, detectedIntent, aiResult, 'default');
                            } catch(e) { console.error('[Cache] Save Error:', e.message); }
                        }
                    }

                    if (aiResult.reply) {
                        const cleanNumber = phoneFormatter.formatNumber(from);
                        const chatId = `${cleanNumber}@c.us`;

                        // 🕒 Adaptive Human-Mimic Delay: Bot Protection (Unified Delay)
                        const wordCount = aiResult.reply.split(/\s+/).length;
                        const thinkingDelay = Math.min(3000, 800 + (wordCount * 80));
                        console.log(`[AI] Calculated mimic delay: ${thinkingDelay}ms for "${cleanNumber}"`);

                        // Handle AI handovers
                        if (aiResult.handover) {
                            await db.updateCustomerAIStatusByNumber(cleanFrom, { handover_requested: 1 });
                            io.emit('handover_alert', { number: cleanFrom, name: notifyName });
                        }

                        // 🧠 Intelligence Sync: Update global CRM with AI-detected tags/intel
                        if (aiResult.intel) {
                            try {
                                await db.updateCustomerIntel(cleanFrom, aiResult.intel);
                                
                                // 📊 Behavioral Sync Engine: Calculate Scores
                                const customer = await db.getCustomerByNumber(cleanFrom);
                                let interestScore = customer ? (customer.interest_score || 0) : 0;
                                let sensitivityScore = customer ? (customer.price_sensitivity_score || 0) : 0;

                                // Rate Limiting/Bargaining Check
                                if (aiResult.intel.tags?.some((t) => /bargain|discount|cheap|price/i.test(t))) {
                                    sensitivityScore = Math.min(100, sensitivityScore + 15);
                                }
                                
                                // Engagement Check (Interest)
                                if (text.length > 20) interestScore = Math.min(100, interestScore + 5);
                                if (aiResult.intel.lifecycle_stage === 'opportunity') interestScore = Math.min(100, interestScore + 10);

                                await db.updateCustomerMetrics(cleanFrom, {
                                    interest_score: interestScore,
                                    price_sensitivity_score: sensitivityScore
                                });

                                io.emit('contact_updated', { 
                                    number: cleanFrom, 
                                    intel: aiResult.intel,
                                    metrics: { interest_score: interestScore, price_sensitivity_score: sensitivityScore }
                                });
                            } catch (intelErr) {
                                console.error('[AI] Failed to sync intelligence:', intelErr);
                            }
                        }

                        // 📦 Infinite Memory: Check if summarization is needed (threshold: 15 messages)
                        if (enhancedContext.rawCount >= 15) {
                            setImmediate(async () => {
                                try {
                                    const newSummary = await aiService.summarizeHistory(enhancedContext.fullContext, enhancedContext.currentSummary);
                                    await db.updateCustomerSummary(cleanFrom, newSummary);
                                } catch(e) {
                                    console.error('[BG-Summarize]', e);
                                }
                            });
                        }

                        // Step 4: [INTENT AUTOMATION / ORDER MANAGEMENT]
                        if (aiResult.action === 'PLACE_ORDER' && aiResult.intel?.extract) {
                            try {
                                const orderData = {
                                    customer_number: cleanNumber,
                                    total_amount: aiResult.intel.extract.total_amount || 0,
                                    items: aiResult.intel.extract.items || [],
                                    shipping_address: aiResult.intel.address || aiResult.intel.extract.address || null,
                                    delivery_charge: aiResult.intel.extract.delivery_charge || 0,
                                    discount: aiResult.intel.extract.discount || 0,
                                    status: 'pending'
                                };
                                const newOrder = await db.addOrder(orderData);
                                aiResult.reply = aiResult.reply.replace('{{order_id}}', newOrder.id);
                                debugLog(`[OMS] 🛍️ Order created for ${cleanNumber}: ID ${newOrder.id}`);
                            } catch (orderErr) {
                                console.error('[OMS] Error placing order:', orderErr);
                                aiResult.reply = aiResult.reply.replace('{{order_id}}', 'SYSTEM_PENDING');
                            }
                        }

                        if (aiResult.action && aiResult.action !== 'PLACE_ORDER') {
                            const intentMedia = await db.getIntents().then(list => list.find(i => i.intent_tag === aiResult.action));
                            if (intentMedia) {
                                try {
                                    await db.addOutgoingQueue(chatId, null, {
                                        url: intentMedia.media_url,
                                        type: intentMedia.media_type
                                    }, {}, {
                                        customer_number: cleanNumber,
                                        contactName: notifyName,
                                        isMedia: true
                                    });
                                } catch (qErr) {
                                    console.error('[AI Hook] Failed to queue media intent:', qErr.message);
                                }
                                debugLog(`[AI Hook] 📦 Automated Media Queued for intent: ${aiResult.action}`);
                            }
                        }

                        // PRODUCTION-GRADE: Queue response in Outbox for guaranteed delivery
                        setTimeout(async () => {
                            try {
                                await db.addOutgoingQueue(chatId, aiResult.reply, null, {}, {
                                    customer_number: cleanNumber,
                                    contactName: notifyName
                                });
                                debugLog(`[AI Hook] 📦 Message queued for ${cleanNumber}`);
                            } catch (qErr) {
                                console.error('[AI Hook] Failed to queue message:', qErr.message);
                            }
                        }, thinkingDelay);
                        
                        debugLog(`[AI Hook] Smart-Reply for ${cleanNumber}. Handover: ${aiResult.handover}`);
                    }
                }
            }
        } catch (err) {
            console.error('[AI Hook] Error during auto-reply generation. Queuing for retry:', err.message);
            
            // PRODUCTION-GRADE RECOVERY: Save to Retry Queue
            try {
                const contextStr = await vectorService.getUnifiedContext(text, from);
                const enhancedContext = await db.getEnhancedConversationContext(from, 10);
                const profile = await db.getBusinessProfile();
                
                await db.addAIRetryTask(from, text, {
                    context: contextStr,
                    history: enhancedContext.fullContext,
                    userMessage: text,
                    businessName: profile.company_name,
                    customerNumber: from,
                    notifyName: notifyName,
                    receivedAt: timestamp // The anchor for the Hybrid Filter
                });
                console.log(`[AI Hook] 📦 Generation Task saved to Retry Queue for ${from}`);
            } catch (queueErr) {
                console.error('[AI Hook] CRITICAL: Failed to save retry task:', queueErr.message);
            }

            debugLog(`[AI Hook] ❌ Error: ${err.message}`);
        }
    });

    socket.on('service_message_reaction', async (data) => {
        const { whatsappId, reaction, senderId } = data;
        try {
            await db.updateMessageReaction(whatsappId, reaction);
            io.emit('message_reaction_update', { whatsapp_id: whatsappId, reaction, sender_id: senderId });
        } catch (err) {
            console.error('Error updating reaction:', err);
        }
    });

    socket.on('service_reaction_result', async (data) => {
        const { success, messageId, reaction } = data;
        if (success) {
            try {
                await db.updateMessageReaction(messageId, reaction);
                io.emit('message_reaction_update', { whatsapp_id: messageId, reaction });
            } catch (err) {
                console.error('Error updating reaction result:', err);
            }
        }
    });

    socket.on('service_message_ack', async (data) => {
        const { whatsappId, ack } = data;
        let status = 'sent';
        if (ack === 2) status = 'delivered';
        else if (ack === 3) status = 'read';

        try {
            await db.updateMessageStatus(whatsappId, status);
            // Also update analytics if this message is linked to a template
            await db.updateTemplateAnalyticStatus(whatsappId, status);
            io.emit('message_status_update', { whatsapp_id: whatsappId, status, ack });
            io.emit('analytics_update', { type: 'status', whatsapp_id: whatsappId, status });
        } catch (err) {
            console.error('Error updating ack status:', err);
        }
    });

    // --- Enterprise Outbox Status Confirmation ---
    socket.on('service_message_result', async (data) => {
        const { success, whatsappId, error, originalData, notifyName } = data;
        const { to, text, contactId, contactName, mediaUrl, mediaType } = originalData;
        const timestamp = new Date().toISOString();
        const cleanNumber = phoneFormatter.formatNumber(to);

        if (success) {
            // Smart Sync: Use fetched notifyName from WhatsApp if available
            const finalName = notifyName || contactName || 'Unknown';
            try {
                await db.syncCustomer(finalName, cleanNumber);
            } catch (syncErr) { }

            // Extract metadata if it's a specialized type
            const metadata = (mediaType === 'vcard' || mediaType === 'location') ? JSON.stringify(originalData) : null;

            debugLog(`[Server] Success result. campaignId: ${originalData.campaignId}`);
            const result = await db.addMessage(cleanNumber, text, timestamp, 'sent', 'sent', whatsappId, mediaUrl ? `/uploads/${path.basename(mediaUrl)}` : null, mediaType, null, originalData.quotedText || (originalData.quotedMessageId ? '(Quoted Message)' : null), metadata, originalData.campaignId);

            // Record in Template Analytics if applicable
            if (originalData.templateId) {
                try {
                    await db.addTemplateAnalytic(originalData.templateId, result.id, whatsappId);
                    io.emit('analytics_update', { type: 'sent', templateId: originalData.templateId });
                } catch (anaErr) {
                    console.error('[Hub] Analytics Record Error:', anaErr);
                }
            }

            io.emit('message-sent', {
                to: cleanNumber, text, contactId, contactName: finalName, id: result.id, timestamp, whatsapp_id: whatsappId,
                media_path: mediaUrl ? `/uploads/${path.basename(mediaUrl)}` : null, media_type: mediaType,
                quotedMsg: originalData.quotedText || (originalData.quotedMessageId ? '(Replying...)' : null),
                metadata: metadata
            });

            // --- Outbox Cleanup ---
            if (data.queueId) {
                try {
                    await db.deleteFromOutbox(data.queueId);
                    debugLog(`[Outbox] ✅ Entry ${data.queueId} cleared from queue.`);
                } catch (qErr) {
                    console.error('[Outbox] Failed to clear entry:', qErr);
                }
            }
            // Removed redundant new_message emit to prevent UI duplication
        } else {
            console.error('Service send error:', error);
            debugLog(`[Server] Error callback. campaignId: ${originalData.campaignId}`);
            io.emit('message-error', { to, error: typeof error === 'string' ? error : (error?.message || 'Unknown Error') });
            
            // --- Outbox Status Recovery (BUG FIX) ---
            if (data.queueId) {
                try {
                    const errorMsg = typeof error === 'string' ? error : (error?.message || 'Unknown');
                    await db.updateOutboxStatus(data.queueId, 'failed', errorMsg);
                    debugLog(`[Outbox] ❌ Entry ${data.queueId} marked as failed.`);
                } catch (qErr) {
                    console.error('[Outbox] Failed to update fail status:', qErr);
                }
            }

            if (cleanNumber) {
                await db.addMessage(cleanNumber, text, timestamp, `error: ${error}`, 'sent', null, null, null, null, null, null, originalData.campaignId);
            }
        }
    });

    // --- FROM DASHBOARD ---
    socket.on('send-message', (data) => {
        const { to, text, mediaUrl, mediaType, quotedMessageId, attachments = [], templateId } = data;
        const cleanNumber = phoneFormatter.formatNumber(to);
        const chatId = `${cleanNumber}@c.us`;

        let finalText = text;
        /* Button formatting logic removed */

        const options = {};
        if (mediaType && mediaType.startsWith('audio/')) {
            options.sendAudioAsVoice = true;
        } else if (finalText && finalText.trim()) {
            options.caption = finalText;
        }

        let finalAttachments = attachments;
        // Map uploads path for attachments
        if (finalAttachments.length > 0) {
            finalAttachments = finalAttachments.map(att => ({
                ...att,
                url: att.url.startsWith('/uploads/') ? `uploads/${path.basename(att.url)}` : att.url,
                type: att.type,
                caption: att.caption
            }));
        }

        io.emit('service_send_message', {
            chatId, text: finalText, options,
            mediaPath: mediaUrl ? `uploads/${path.basename(mediaUrl)}` : null,
            to, contactId: data.contactId, contactName: data.contactName, mediaUrl, mediaType,
            quotedMessageId,
            quotedText: data.quotedText,
            attachments: finalAttachments,
            templateId, // Pass templateId along to be saved on result
            city: data.city,
            companyName: data.companyName,
            address: data.address,
            email: data.email,
            lastPurchase: data.lastPurchase
        });
    });

    socket.on('send-reaction', (data) => {
        const { whatsappId, reaction } = data;
        io.emit('service_send_reaction', { messageId: whatsappId, reaction });
    });

    socket.on('update_execution_delays', (data) => {
        const { campaignId, delayMinMs, delayMaxMs } = data;
        scheduler.updateCampaignDelay(campaignId, delayMinMs, delayMaxMs);
    });

    /* Carousel events removed */

    socket.on('restart-service', async (data) => {
        console.log('[Hub] Requesting WA-Service restart. Data:', data);
        if (data.clearSession) {
            try { await db.clearConnectedAccount(); } catch (e) { }
            waStatus.accountInfo = null;
        }
        io.emit('service_restart', data);
    });

    // --- SYNC HUB ---
    socket.on('sync-contacts', (data) => {
        const mode = data?.mode || 'all';
        const groupId = data?.groupId;
        console.log(`[Hub] Requesting ${mode} contact sync from service${groupId ? ` for group ${groupId}` : ''}`);
        io.emit('service_sync_contacts', { mode, groupId });
    });

    socket.on('fetch-more-history', async (data) => {
        const { chatId, lastMsgId, limit = 30 } = data;

        // Safety check to prevent "No LID" error from invalid identifiers
        if (!chatId || typeof chatId !== 'string' || chatId.length < 5 || chatId === 'status@broadcast' || /^[a-zA-Z]+$/.test(chatId)) {
            console.warn(`[Hub] Invalid chatId provided for history fetch: ${chatId || 'undefined'}`);
            socket.emit('history_loaded', { chatId, messages: [] });
            return;
        }

        const cleanNumber = phoneFormatter.formatNumber(chatId);
        console.log(`[Hub] Requesting more history for ${cleanNumber} (Last ID: ${lastMsgId})`);

        try {
            // Priority 1: Check Local Database for fast response
            const localHistory = await db.getChatHistory(cleanNumber, lastMsgId, limit);

            if (localHistory && localHistory.length > 0) {
                console.log(`[Hub] Found ${localHistory.length} messages in local DB for ${cleanNumber}`);
                socket.emit('history_loaded', { chatId, messages: localHistory });

                // If we found enough messages, we don't necessarily need to hit WA service immediately
                // unless it's a small amount and we want to ensure we have everything.
                if (localHistory.length >= limit) return;
            }

            // Priority 2: Request from WhatsApp Service if local is empty or insufficient
            console.log(`[Hub] Local history insufficient, requesting from WA service for ${cleanNumber}`);
            io.emit('service_fetch_more_history', data);
        } catch (err) {
            console.error('[Hub] Local history fetch error:', err);
            // Fallback to service on error
            io.emit('service_fetch_more_history', data);
        }
    });

    // --- Process Relay ---
    socket.on('process_start', (data) => io.emit('process_start', data));
    socket.on('process_update', (data) => io.emit('process_update', data));
    socket.on('process_end', (data) => io.emit('process_end', data));

    // --- Scheduler Message ACK relay ---
    // whatsapp-service emits scheduler_msg_sent/error, we forward to schedulerBus
    socket.on('scheduler_msg_sent', (data) => {
        schedulerBus.emit('scheduler_msg_sent', data);
    });
    socket.on('scheduler_msg_error', (data) => {
        schedulerBus.emit('scheduler_msg_error', data);
    });
    // Also relay via service_message_result for scheduler-tracked messages
    socket.on('service_message_result', (data) => {
        if (data?.originalData?.schedulerTracked && data?.originalData?.reqId) {
            if (data.success) {
                schedulerBus.emit('scheduler_msg_sent', { reqId: data.originalData.reqId });
            } else {
                schedulerBus.emit('scheduler_msg_error', { reqId: data.originalData.reqId, error: data.error || 'Send failed' });
            }
        }
    });

    // --- Scheduled Campaign Relay ---
    // Relay real-time status updates to all frontend clients
    socket.on('scheduled_campaign_update', (data) => io.emit('scheduled_campaign_update', data));

    socket.on('service_contacts_sync_result', async (data) => {
        if (!data.success) {
            io.emit('process_end', { status: 'failed', message: `Sync failed: ${data.error}` });
            return console.error('[Hub] Contact sync failed:', data.error);
        }

        const processId = `sync_${Date.now()}`;
        cancelledProcesses.delete(processId);
        io.emit('process_start', { id: processId, title: 'Syncing Contacts', total: data.contacts.length * 2 });

        console.log(`[Hub] Received ${data.contacts.length} contacts for sync`);

        try {
            const totalFetched = data.contacts.length;
            for (let i = 0; i < data.contacts.length; i++) {
                if (cancelledProcesses.has(processId)) {
                    cancelledProcesses.delete(processId);
                    io.emit('process_end', { status: 'failed', message: 'Sync cancelled by user.' });
                    return;
                }

                const contact = data.contacts[i];
                const result = await db.syncCustomer(contact.name, contact.number);
                if (data.groupId && result.id) {
                    await db.addContactToGroup(result.id, data.groupId);
                }

                // Emit progress (Saving Phase: N+1 to 2N)
                io.emit('process_update', {
                    message: `Saving: ${contact.name} 💾`,
                    type: 'success',
                    current: totalFetched + i + 1
                });
            }
            io.emit('sync_status', { type: 'contacts', success: true, count: data.contacts.length });
            io.emit('process_end', { status: 'completed', message: `Successfully synced and saved ${data.contacts.length} contacts!` });
        } catch (err) {
            console.error('[Hub] Contact DB sync error:', err);
            io.emit('process_end', { status: 'failed', message: `DB Sync failed: ${err.message}` });
        }
    });

    socket.on('service_history_result', async (data) => {
        const { success, chatId, messages, error } = data;
        if (!success) return io.emit('history_error', { chatId, error });

        console.log(`[Hub] Received ${messages.length} messages for chat ${chatId}`);

        try {
            const savedMessages = [];
            for (const msg of messages) {
                let mediaPath = null;
                if (msg.media) {
                    const filename = msg.media.filename;
                    const fullPath = path.join(__dirname, 'uploads', filename);
                    await fs.promises.writeFile(fullPath, msg.media.data, 'base64');
                    mediaPath = `/uploads/${filename}`;
                }

                const timestamp = new Date(msg.timestamp * 1000).toISOString();
                const msgType = msg.type || (msg.fromMe ? 'sent' : 'received');
                const result = await db.addMessage(
                    chatId,
                    msg.text,
                    timestamp,
                    'read',
                    msgType,
                    msg.whatsappId,
                    mediaPath,
                    msg.media ? msg.media.mimetype : null
                );

                // result may be an existing row (duplicate) or a new insert
                const savedId = result?.id || null;
                savedMessages.push({
                    ...msg,
                    id: savedId,
                    timestamp,
                    media_path: mediaPath,
                    media_type: msg.media ? msg.media.mimetype : null
                });
            }

            io.emit('history_loaded', { chatId, messages: savedMessages });
        } catch (err) {
            console.error('[Hub] History DB sync error:', err);
        }
    });
});

// --- AI Brain APIs ---
app.get('/api/ai-brain/profile', async (req, res) => {
    try { res.json({ success: true, profile: await db.getBusinessProfile() }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/profile', async (req, res) => {
    try {
        await db.saveBusinessProfile(req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/ai-brain/products', async (req, res) => {
    try {
        const options = {
            search: req.query.search,
            limit: parseInt(req.query.limit) || 50,
            offset: parseInt(req.query.offset) || 0
        };
        const page = Math.floor(options.offset / options.limit) + 1;
        const products = await db.getAIProducts(options);
        const total = await db.countAIProducts({ search: options.search });
        const pendingTotal = await db.countAIProductsPendingVector();

        res.json({
            success: true,
            products,
            pagination: {
                total,
                pendingTotal,
                page,
                limit: options.limit,
                totalPages: Math.ceil(total / options.limit)
            }
        });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/products', async (req, res) => {
    try {
        const result = await db.addAIProduct({ ...req.body, source: 'manual', manual_override: 1 });
        io.emit('intelligent_products_changed');
        res.json({ success: true, id: result.id });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/ai-brain/products/:id', async (req, res) => {
    try {
        const { category_id, ...rest } = req.body;
        const productId = req.params.id;
        
        // 1. Update Database
        await db.updateAIProduct(productId, { ...rest, category_id, manual_override: 1, embedding: null });
        
        // 2. Trigger Real-time AI Vector Re-indexing (Fire and forget or wait depending on UX)
        // We trigger it without blocking the response for maximum speed, 
        // but it runs in the background to ensure AI memory is fresh.
        vectorService.reindexProduct(productId).then(success => {
            if (success) {
                io.emit('intelligent_products_changed'); // Notify UI that vector is ready
                console.log(`[Hub] Real-time Vector Sync Complete for ${productId}`);
            }
        });

        io.emit('intelligent_products_changed');
        res.json({ success: true, message: 'Intelligence record updated and re-indexing triggered.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.patch('/api/ai-brain/products/:id/stock', async (req, res) => {
    try {
        const { stock_quantity, variants } = req.body;
        const productId = req.params.id;
        
        // Use the existing db.updateAIProduct to update ONLY stock-related fields
        await db.updateAIProduct(productId, { stock_quantity, variants });
        
        io.emit('intelligent_products_changed');
        res.json({ success: true, message: 'Stock updated successfully.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/ai-brain/products/:id', async (req, res) => {
    try {
        await db.deleteAIProduct(req.params.id);
        io.emit('intelligent_products_changed');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/products/bulk-delete', async (req, res) => {
    try {
        const { ids, selectionMode, filter } = req.body;
        
        if (selectionMode === 'filter') {
            await db.bulkDeleteAIProductsByFilter(filter || {});
        } else {
            if (!ids || !Array.isArray(ids)) return res.status(400).json({ success: false, error: 'IDs array required' });
            await db.bulkDeleteAIProductsByFilter(ids ? { ids } : {}); // Fallback or handle specifically
            // WAIT, bulkDeleteAIProducts exists for IDs. Let's fix this logic.
            await db.bulkDeleteAIProducts(ids);
        }
        
        io.emit('intelligent_products_changed');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Smart Finance & Procurement APIs ──────────────────────────────────────────

app.get('/api/ai-brain/procurements', async (req, res) => {
    try { 
        const batchId = req.query.batch_id;
        const procurements = await db.getProcurements(batchId);
        let expenses = [];
        
        if (batchId) {
            expenses = await db.getBatchExpenses(batchId);
        }
        
        res.json({ success: true, procurements, expenses }); 
    }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/ai-brain/procurement-batches', async (req, res) => {
    try { res.json({ success: true, batches: await db.getProcurementBatches() }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/procurements', async (req, res) => {
    try {
        const result = await db.addProcurement(req.body);
        io.emit('intelligent_products_changed'); // Procurement updates stock
        res.json({ success: true, id: result.id });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/procurements/batch', async (req, res) => {
    try {
        const result = await db.addProcurementsBatch(req.body);
        io.emit('intelligent_products_changed'); // Notify UI to refresh stock levels
        res.json({ success: true, count: result.count });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/ai-brain/procurements/last-price', async (req, res) => {
    try {
        const { product_id, variant_name } = req.query;
        const price = await db.getLastPurchasePrice(product_id, variant_name || null);
        res.json({ success: true, price });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/ai-brain/expenses', async (req, res) => {
    try { res.json({ success: true, expenses: await db.getExpenses() }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/expenses', async (req, res) => {
    try {
        const result = await db.addExpense(req.body);
        res.json({ success: true, id: result.id });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/ai-brain/expenses/:id', async (req, res) => {
    try {
        await db.deleteExpense(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/ai-brain/finance/overview', async (req, res) => {
    try { res.json({ success: true, overview: await db.getFinanceOverview() }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Supplier Management & Ledger ───────────────────────────────────────────────────

app.get('/api/ai-brain/suppliers', async (req, res) => {
    try { res.json({ success: true, suppliers: await db.getSuppliers() }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/suppliers', async (req, res) => {
    try {
        const result = await db.addSupplier(req.body);
        res.json({ success: true, id: result.id });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/ai-brain/suppliers/:id/ledger', async (req, res) => {
    try { res.json({ success: true, ledger: await db.getSupplierLedger(req.params.id) }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/ai-brain/suppliers/:id/batches', async (req, res) => {
    try { res.json({ success: true, batches: await db.getSupplierBatches(req.params.id) }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/suppliers/payment', async (req, res) => {
    try {
        const result = await db.addSupplierPayment(req.body);
        res.json({ success: true, id: result.id });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/ai-brain/categories', async (req, res) => {
    try { res.json({ success: true, categories: await db.getCategories() }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/categories', async (req, res) => {
    try {
        const result = await db.addCategory(req.body);
        io.emit('intelligent_products_changed'); // Categories affect products
        res.json({ success: true, id: result.id });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/ai-brain/categories/:id', async (req, res) => {
    try {
        await db.updateCategory(req.params.id, req.body);
        io.emit('intelligent_products_changed');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/ai-brain/categories/:id', async (req, res) => {
    try {
        await db.deleteCategory(req.params.id);
        io.emit('intelligent_products_changed');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/ai-brain/knowledge', async (req, res) => {
    try { res.json({ success: true, documents: await db.getKnowledgeDocuments() }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// --- OMS (Order Management System) APIs ---
app.get('/api/oms/orders', async (req, res) => {
    try {
        const customerNumber = req.query.customer_number;
        const orders = await db.getOrders(customerNumber);
        res.json({ success: true, orders });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/oms/orders/:id', async (req, res) => {
    try {
        const order = await db.getOrderById(req.params.id);
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
        res.json({ success: true, order });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/oms/orders/:id/payments', async (req, res) => {
    try {
        const payments = await db.getOrderPayments(req.params.id);
        res.json({ success: true, payments });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/oms/orders', async (req, res) => {
    try {
        let {
            customer_number,
            customer_name,
            total_amount,
            items,
            delivery_charge = 0,
            discount = 0,
            order_notes = '',
            shipping_address = '',
            address_tag = 'Home'
        } = req.body;
        
        // 🛡️ SANITATION LAYER: Ensure items is an actual array (Prevent double-encoding)
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch (e) { items = []; }
        }
        if (!Array.isArray(items)) items = [];

        if (!customer_number) {
            return res.status(400).json({ success: false, error: 'Customer number is required.' });
        }

        // 1. Clean & format phone number
        const cleanNumber = phoneFormatter.formatNumber(customer_number);

        // [AUTO-CONSOLIDATION] - Ensure exactly one master pending order exists before processing
        await db.consolidatePendingOrders(cleanNumber);

        // 2. Fetch customer or Auto-create if new
        let cust = await db.getCustomerByNumber(cleanNumber);
        
        if (!cust) {
            const savedAddresses = shipping_address ? JSON.stringify([{ tag: address_tag, address: shipping_address }]) : '[]';
            await db.addCustomer({ 
                name: customer_name || 'New Customer', 
                number: cleanNumber, 
                address: shipping_address,
                saved_addresses: savedAddresses
            });
            cust = await db.getCustomerByNumber(cleanNumber);
        } else {
            // Update profile if data provided is newer/better
            const updates = {};
            if (customer_name && customer_name !== cust.name && customer_name !== 'New Customer') updates.name = customer_name;
            if (shipping_address && shipping_address !== cust.address) updates.address = shipping_address;
            
            // Smart Address List Management
            if (shipping_address) {
                let saved = [];
                try { saved = JSON.parse(cust.saved_addresses || '[]'); } catch (e) { saved = []; }
                
                // Add or update matching tag
                const existingIndex = saved.findIndex(a => a.tag === address_tag);
                if (existingIndex > -1) {
                    saved[existingIndex].address = shipping_address;
                } else {
                    saved.push({ tag: address_tag, address: shipping_address });
                }
                updates.saved_addresses = JSON.stringify(saved);
            }

            if (Object.keys(updates).length > 0) {
                await db.updateCustomer(cust.id, updates);
            }
        }
        
        const currentNormalizedAddr = (shipping_address || 'UNSPECIFIED').trim().toLowerCase().replace(/\s+/g, ' ');

        // [UNIFIED BALANCE ENGINE]
        // activeUnpaidOrders: used for financial debt summation (Terminal nodes only to prevent duplication)
        const activeUnpaidOrders = await db.getPreviousUnpaidOrders(cleanNumber);
        
        // mergeableCandidates: used for item harvesting (Includes all pending orders regardless of debt transfer)
        const mergeableCandidates = await db.getMergeableCandidates(cleanNumber);
        
        let dynamicPreviousDue = 0;
        for (const o of activeUnpaidOrders) {
            // 🛡️ CHAIN-AWARE GUARD: Only count orders that haven't been transferred yet.
            // If we count a transferred order, we double the debt because its successor already holds it.
            if (o.is_debt_transferred === 0) {
                const total = parseFloat(o.total_amount?.toString().replace(/[^0-9.]/g, '')) || 0;
                const paid = parseFloat(o.amount_paid) || 0;
                dynamicPreviousDue += (total - paid);
            }
        }

        // Check for mergeable orders (Pending/Processing) that share the SAME address
        // We look in mergeableCandidates to find ALL potential item sources
        const mergeableOrder = (mergeableCandidates || []).find(o => 
            ['pending', 'processing'].includes(o.status) && 
            (o.shipping_address || 'UNSPECIFIED').trim().toLowerCase().replace(/\s+/g, ' ') === currentNormalizedAddr
        );
        
        // If we found a mergeable order, its items will be combined. 
        // We MUST subtract its balance from dynamicPreviousDue to avoid double-counting its items,
        // BUT we must keep its own 'due_added' because that is debt it was already carrying from an even earlier predecessor.
        let finalDueForNewOrder = dynamicPreviousDue;
        let mergeMasterPaid = 0;

        if (mergeableOrder) {
            const mTotal = parseFloat(mergeableOrder.total_amount?.toString().replace(/[^0-9.]/g, '')) || 0;
            const mPaid = parseFloat(mergeableOrder.amount_paid) || 0;
            const mDueAdded = parseFloat(mergeableOrder.due_added) || 0;
            
            // Financial Transfer: Carry forward any payments made on the mergeable order
            mergeMasterPaid = mPaid;

            // Subtract only the 'Current Order Part' of the mergeable order (Items + Delivery - Discount)
            // which is equivalent to (Total - DueAdded). 
            // Since we move items, we don't want to count them as debt.
            const mItemsPart = mTotal - mDueAdded;
            finalDueForNewOrder -= (mItemsPart - mPaid); 
        }
        
        const combinedDue = Math.max(0, finalDueForNewOrder);
        let finalItems = [...items];
        let mergeNotes = '';

        if (mergeableOrder) {
            try {
                // Enrich items with source reference (Smart Dynamic: Preserve original source if exists)
                const oldItems = JSON.parse(mergeableOrder.items || '[]').map(it => ({ 
                    ...it, 
                    mergedFrom: it.mergedFrom || mergeableOrder.id 
                }));
                // Prepend old items to keep chronological order
                finalItems = [...oldItems, ...items];
                
                // Mark old order as merged and cancel it from active flow
                await db.updateOrderStatus(mergeableOrder.id, 'merged');
                
                mergeNotes = `\n📦 *Smart Merge:* Items from previous Order #${mergeableOrder.id} have been consolidated into this delivery.`;
                console.log(`[OMS] Smart Merged items from Order ${mergeableOrder.id} to new order.`);
            } catch (err) {
                console.error("Merge Engine Error:", err);
            }
        }

        // [BUG 2 FIX] Ensure due from merged order is carried over
        // [FIX] Duplicate combinedDue removed. Using the one calculated by UNIFIED BALANCE ENGINE.

        // --- VALIDATION LAYER ---
        // Use finalItems (which includes merged items) for correct total validation
        const itemsSum = finalItems.reduce((sum, it) => sum + (parseFloat(it.price.toString().replace(/[^0-9.]/g, '')) || 0) * (it.qty || 1), 0);
        const deliveryVal = parseFloat(delivery_charge) || 0;
        const discountVal = parseFloat(discount) || 0;
        const expectedTotal = itemsSum + deliveryVal - discountVal + combinedDue;
        const actualTotal = parseFloat(total_amount.toString().replace(/[^0-9.]/g, '')) || 0;

        if (Math.abs(actualTotal - expectedTotal) > 1) {
            console.warn(`[OMS] Total Mismatch Detected! Expected: ${expectedTotal}, Received: ${actualTotal}. Forcing expected total for integrity.`);
            total_amount = `৳${expectedTotal}`; // [FIX] Force correct total
        }

        // Create order directly with provided total amount
        const newOrder = await db.createOrder({
            customer_number: cleanNumber, 
            items: JSON.stringify(finalItems),
            total_amount: total_amount,
            delivery_charge: delivery_charge,
            discount,
            order_notes: (order_notes || '') + mergeNotes,
            shipping_address,
            due_added: combinedDue,
            amount_paid: mergeMasterPaid,
            payment_status: mergeMasterPaid > 0 ? (mergeMasterPaid >= expectedTotal ? 'paid' : 'partial') : 'pending'
        });

        // CRITICAL: Link and Log the old order merge
        if (mergeableOrder) {
            await db.appendOrderNote(mergeableOrder.id, `Successor Master Order: #${newOrder.id}`);
            await db.markDebtAsTransferred(mergeableOrder.id, newOrder.id);
            // Calculate value of items being merged for the ledger
            const oldItemsVal = oldItems.reduce((s, it) => s + (parseFloat(it.price?.toString().replace(/[^0-9.]/g, '')) || 0) * (it.qty || 1), 0);
            await db.addOrderLog(newOrder.id, 'merge', 'none', 'pending', `📦 Smart Merged items from Order #${mergeableOrder.id}: ${oldItemsVal} TK`);
            await db.addOrderLog(mergeableOrder.id, 'transferred', mergeableOrder.status, 'merged', `➡️ Balance transferred to Successor #${newOrder.id}`);
            
            // [AUDIT TRAIL] Link the transferred payment explicitly in the ledger
            if (mergeMasterPaid > 0) {
                await db.db.run("INSERT INTO order_payments (order_id, amount, method, notes) VALUES (?, ?, ?, ?)",
                    [newOrder.id, mergeMasterPaid, 'transfer', `[LINKED] Balance Transferred from Merged Order #${mergeableOrder.id}`]);
            }

            const socket = req.app.get('socketio');
            if (socket) socket.emit('order_status_updated', { id: mergeableOrder.id });
        } else {
            await db.addOrderLog(newOrder.id, 'creation', 'none', 'pending', `🆕 New order created for ${cleanNumber}`);
        }

        // Reset customer's previous due securely
        await db.updateCustomerDue(cleanNumber, 0);

        // 🔥 RE-MASTERING GUARD: Final cleanup to catch any orphans that might have been missed
        await db.consolidatePendingOrders(cleanNumber);

        // 3. Debt Transfer Logic: Mark old orders as transferred to prevent double-counting
        // We use activeUnpaidOrders which we fetched earlier
        if (activeUnpaidOrders.length > 0) {
            try {
                for (const oldOrder of activeUnpaidOrders) {
                    // LINK: We link all unpaid orders (including the merged one) to the new master
                    // This is essential for both financial tracking AND merge-reversion.

                    const oldTotal = parseFloat(oldOrder.total_amount?.toString().replace(/[^0-9.]/g, '')) || 0;
                    const oldPaid = parseFloat(oldOrder.amount_paid) || 0;
                    const remaining = oldTotal - oldPaid;

                    const isMergeSource = mergeableOrder && oldOrder.id === mergeableOrder.id;

                    // Carry debt for ALL unpaid orders (Global Debt Channel)
                    if (remaining > 0 || isMergeSource) {
                        const transferNote = `[Transferred] Remaining balance of ৳${remaining.toLocaleString()} has been moved to New Order #${newOrder.id}.`;
                        await db.appendOrderNote(oldOrder.id, transferNote);
                        await db.markDebtAsTransferred(oldOrder.id, newOrder.id);
                        await db.addOrderLog(oldOrder.id, 'debt_transfer', oldOrder.status, oldOrder.status, `💸 Debt transferred to New Order #${newOrder.id}`);
                        await db.addOrderLog(newOrder.id, 'debt_pickup', 'none', 'pending', `📥 Picked up ৳${remaining} debt from Order #${oldOrder.id}`);
                        console.log(`[OMS] Transferred debt from Order ${oldOrder.id} to Order ${newOrder.id}`);
                    }
                }
            } catch (err) {
                console.error("Debt Transfer Error:", err);
            }
        }

        res.json({ success: true, order: newOrder });
    } catch (e) {
        console.error("Order Creation Error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// [AUDIT TRAIL] Fetch logs for a specific order
app.get('/api/oms/orders/:id/predecessors', async (req, res) => {
    try {
        const predecessors = await db.getMergedPredecessorsRecursive(req.params.id);
        res.json({ success: true, predecessors });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/oms/orders/:id/debt-chain', async (req, res) => {
    try {
        console.log(`[FINANCE] Fetching debt chain for Order #${req.params.id}`);
        const chain = await db.getDetailedDebtChain(req.params.id);
        console.log(`[FINANCE] Chain found for #${req.params.id}: ${chain.length} nodes`);
        res.json({ success: true, chain });
    } catch (err) {
        console.error(`[FINANCE] Error fetching chain for #${req.params.id}:`, err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/oms/orders/:id/logs', async (req, res) => {
    try {
        const logs = await db.getOrderLogs(req.params.id);
        res.json({ success: true, logs });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.patch('/api/oms/orders/:id/status', async (req, res) => {
    try {
        const { status, tracking_id, reactivateOrderIds } = req.body;
        const orderId = req.params.id;

        // 1. Fetch current order state before update
        const order = await db.getOrderById(orderId);
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

        // 🔒 Logical Guard: Delivery Address required for Production/Transit
        if (['processing', 'shipped', 'delivered'].includes(status) && !order.customer_address) {
            return res.status(400).json({ 
                success: false, 
                error: "Shipping address required before moving to " + status 
            });
        }

        const oldStatus = order.status;
        const result = await db.updateOrderStatus(orderId, status, tracking_id);
        
        // --- AUDIT LOGGING ---
        await db.addOrderLog(orderId, 'status_change', oldStatus, status, `Order status moved from ${oldStatus} to ${status}`);
        
        // 2. Automated Debt Logic
        if (oldStatus !== 'delivered' && status === 'delivered') {
            // ORDER DELIVERED: Unpaid balance becomes permanent debt
            const total = parseFloat(order.total_amount.toString().replace(/[^0-9.]/g, '')) || 0;
            const paid = parseFloat(order.amount_paid || 0);
            const balance = total - paid;
            
            if (balance > 0) {
                await db.incrementCustomerDue(order.customer_number, balance);
                await db.addOrderLog(orderId, 'debt_added', oldStatus, status, `💸 Order delivered with balance ৳${balance}. Added to customer due.`);
                console.log(`[OMS] Order ${orderId} delivered. Added balance ${balance} to customer ${order.customer_number}`);
            }
        } else if (oldStatus !== 'cancelled' && (status === 'cancelled' || status === 'returned')) {
            // ORDER CANCELLED/RETURNED: Restore any previous debt that was included in this order
            
            // 🛡️ INTELLIGENT CHAIN TRAVERSAL & TERMINAL GUARD
            if (order.is_debt_transferred === 1) {
                try {
                    // Follow the Debt Chain to find the final living successor (The Head of the Chain)
                    const lastActiveMaster = await db.findActiveSuccessiveMaster(orderId);

                    const amountToDeduct = (parseFloat(order.total_amount.toString().replace(/[^0-9.]/g, '')) || 0) - (parseFloat(order.amount_paid) || 0);

                    if (lastActiveMaster && !['delivered', 'cancelled'].includes(lastActiveMaster.status)) {
                        // CASE A: Active Successor found -> Adjust its total
                        await db.adjustOrderBalance(lastActiveMaster.id, -amountToDeduct);
                        await db.addOrderLog(lastActiveMaster.id, 'debt_adjustment', lastActiveMaster.status, lastActiveMaster.status, `📉 Predecessor Order #${orderId} was CANCELLED. Total reduced by ৳${amountToDeduct}.`);
                        await db.addOrderLog(orderId, 'successor_adjusted', oldStatus, status, `✅ Debt chain followed to Successor #${lastActiveMaster.id}. Total reduced.`);
                        console.log(`[OMS] Debt Chain followed from ${orderId} to ${lastActiveMaster.id}. Reduced by ${amountToDeduct}`);
                    } else if (lastActiveMaster && lastActiveMaster.status === 'delivered') {
                        // CASE B: Terminal Guard -> Successor is Delivered. Adjust Profile.
                        await db.incrementCustomerDue(order.customer_number, -amountToDeduct);
                        
                        const adjustmentNote = `[Financial Adjustment] Order #${orderId} cancelled after debt transfer to Delivered Successor #${lastActiveMaster.id}. ৳${amountToDeduct} credited to account.`;
                        await db.appendCustomerNote(order.customer_number, adjustmentNote);
                        await db.appendOrderNote(lastActiveMaster.id, `[Predecessor Cancelled] Order #${orderId} was cancelled. ৳${amountToDeduct} credit applied to customer.`);
                        
                        await db.addOrderLog(orderId, 'terminal_credit', oldStatus, status, `💸 Terminal Successor #${lastActiveMaster.id} is DELIVERED. ৳${amountToDeduct} credited to customer profile.`);
                        console.log(`[OMS] Terminal Guard: Credited ${amountToDeduct} to profile because successor ${lastActiveMaster.id} is delivered.`);
                    } else {
                        // CASE C: Fallback to profile restoration if chain is broken
                        const restoredDue = parseFloat(order.due_added) || 0;
                        if (restoredDue > 0) {
                            await db.incrementCustomerDue(order.customer_number, restoredDue);
                            await db.addOrderLog(orderId, 'restoration', oldStatus, status, `🔄 Chain broken. Restored ৳${restoredDue} to profile.`);
                        }
                    }
                } catch (err) {
                    console.error("[OMS] Chain Traversal Error:", err);
                }
            } else {
                // No successor, normal restoration to profile
                const restoredDue = parseFloat(order.due_added) || 0;
                if (restoredDue > 0) {
                    await db.incrementCustomerDue(order.customer_number, restoredDue);
                    
                    const note = `[Debt Restored] Previous balance is active again (Order #${orderId} was ${status}).`;
                    await db.appendOrderNote(orderId, note);
                    await db.addOrderLog(orderId, 'restoration', oldStatus, status, `🔄 Restored ৳${restoredDue} to customer profile due to cancellation`);
                }
            }

            // [GRANULAR MERGE REVERSION] - Universal: Restore selected merged ancestors recursively
            try {
                const mergedAncestors = await db.getMergedPredecessorsRecursive(orderId);
                for (const mOrder of mergedAncestors) {
                    const shouldReactivate = reactivateOrderIds && reactivateOrderIds.some(id => String(id) === String(mOrder.id));

                    if (shouldReactivate) {
                        // 💉 SURGICAL FILTERING: Remove items from non-reactivated predecessors
                        let items = JSON.parse(mOrder.items || '[]');
                        const beforeCount = items.length;
                        items = items.filter(it => {
                            const sourceId = it.mergedFrom || mOrder.id;
                            return String(sourceId) === String(mOrder.id) || 
                                   (reactivateOrderIds && reactivateOrderIds.some(rid => String(rid) === String(sourceId)));
                        });
                        const itemsTotal = items.reduce((sum, it) => {
                             const p = parseFloat(it.price?.toString().replace(/[^0-9.]/g, '')) || 0;
                             return sum + (p * (it.qty || 1));
                        }, 0);
                        const finalTotal = itemsTotal + (parseFloat(mOrder.delivery_charge) || 0) - (parseFloat(mOrder.discount) || 0) + (parseFloat(mOrder.due_added) || 0);
                        await new Promise((res) => {
                            db.db.run("UPDATE orders SET items = ?, total_amount = ?, debt_source_order_id = NULL, is_debt_transferred = 0 WHERE id = ?", 
                                [JSON.stringify(items), `৳${finalTotal}`, mOrder.id], () => res());
                        });
                        await db.updateOrderStatus(mOrder.id, 'pending');
                        await db.addOrderLog(mOrder.id, 'unmerge', 'merged', 'pending', `🔄 Surgical Un-merge: Items filtered from ${beforeCount} to ${items.length} based on selection.`);
                    } else {
                        await db.updateOrderStatus(mOrder.id, 'cancelled');
                        await db.addOrderLog(mOrder.id, 'status_change', 'merged', 'cancelled', `🚫 Master Order #${orderId} was cancelled. This merged ancestor is also cancelled.`);
                    }
                }
            } catch (unmergeErr) {
                console.error("[OMS] Recursive Merge Reversion Error:", unmergeErr);
            }
        }

        // 🔥 RE-MASTERING ENGINE: Consolidation of reactivated predecessors
        // This handles cases where a master was cancelled and predecessors were restored to pending.
        await db.consolidatePendingOrders(order.customer_number);

        const io = global.io;
        if (io) {
            io.emit('order_status_updated', { id: orderId, status, tracking_id });
            // [CRM EVOLUTION] Recalculate LTV if status changed to/from 'cancelled'
            if (oldStatus === 'cancelled' || status === 'cancelled' || status === 'delivered') {
                await db.recalculateCustomerLTV(order.customer_number);
                io.emit('customer_intel_updated', { number: order.customer_number, action: 'ltv_sync' });
            }
        }
        
        res.json({ success: true, ...result });
    } catch (e) { 
        console.error("Order Status Update Error:", e);
        res.status(500).json({ success: false, error: e.message }); 
    }
});

app.get('/api/oms/customers/:number/active-orders', async (req, res) => {
    try {
        const query = `
            SELECT id, status, total_amount, shipping_address, created_at 
            FROM orders 
            WHERE customer_number = ? 
            AND status IN ('pending', 'processing', 'shipped')
            ORDER BY id DESC
        `;
        db.db.all(query, [req.params.number], (err, rows) => {
            if (err) throw err;
            res.json({ success: true, orders: rows });
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.patch('/api/oms/orders/:id/verify', async (req, res) => {
    try {
        const { status } = req.body;
        const result = await db.verifyOrder(req.params.id, status);
        
        io.emit('order_verified', { id: req.params.id, verified: status });
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.patch('/api/oms/orders/:id/payment', async (req, res) => {
    try {
        const { payment_status, amount_paid, method, notes } = req.body;
        const orderId = req.params.id;

        // 1. Fetch current order state before update
        const order = await db.getOrderById(orderId);
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

        const oldPaid = parseFloat(order.amount_paid || 0);
        const newPaidValue = parseFloat(amount_paid || 0);
        const diff = newPaidValue - oldPaid;

        if (diff <= 0) {
            // Just update status if no money added
            const result = await db.updateOrderPayment(orderId, { payment_status, amount_paid: newPaidValue });
            return res.json({ success: true, ...result });
        }

        // --- SMART PAYMENT ENGINE CALL ---
        // This handles atomic recording, linked propagation, and profile sync.
        const result = await db.processSmartOrderPayment(orderId, diff, method || 'cash', notes || 'Manual Payment Entry');
        
        if (!result.success) throw new Error("Payment processing failed");

        // [LOGIC REFINEMENT] 
        // As per Senior System Architect & User Mandate:
        // Downward propagation of payments (Master -> Predecessors) is disabled 
        // to maintain ledger isolation and fulfill Source-Pinned Payment standards.
        // Predecessors will remain in 'Transferred' state without physical payment records.


        // Notify UI of changes
        io.emit('order_payment_updated', { id: orderId, payment_status, amount_paid: newPaidValue });
        io.emit('order_status_updated', { id: orderId }); 
        
        res.json({ success: true, ...result });
    } catch (e) { 
        console.error("Payment Sync & Settlement Error:", e);
        res.status(500).json({ success: false, error: e.message }); 
    }
});

app.patch('/api/oms/orders/:id/manifest', async (req, res) => {
    try {
        const { id } = req.params;
        const { items, total_amount, delivery_charge, discount } = req.body;
        
        const result = await db.updateOrderManifest(id, items, total_amount, delivery_charge, discount);
        
        if (result.success && result.order) {
            // [CRM EVOLUTION] Recalculate LTV as total_amount might have changed
            await db.recalculateCustomerLTV(result.order.customer_number);
            io.emit('order_manifest_updated', { id, items, total_amount });
            io.emit('customer_intel_updated', { number: result.order.customer_number, action: 'manifest_ltv_sync' });
        }
        res.json({ success: true, ...result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.patch('/api/oms/orders/:id/meta', async (req, res) => {
    try {
        const { id } = req.params;
        const { delivery_charge, shipping_address, shipping_phone } = req.body;
        
        const result = await db.updateOrderMeta(id, { delivery_charge, shipping_address, shipping_phone });
        
        if (result.success) {
            // 🔄 Intelligence Sync: Fetch full order to trigger LTV and UI sync
            const updatedOrder = await db.getOrderById(id);
            if (updatedOrder) {
                // [CRM SYNC] If address updated, also update customer profile
                if (shipping_address) {
                    try {
                        const cust = await db.getCustomerByNumber(updatedOrder.customer_number);
                        if (cust) await db.updateCustomer(cust.id, { address: shipping_address });
                    } catch (err) { console.error("[OMS Sync] Customer address sync failed:", err); }
                }

                await db.recalculateCustomerLTV(updatedOrder.customer_number);
                io.emit('order_manifest_updated', { 
                    id, 
                    total_amount: updatedOrder.total_amount,
                    delivery_charge: updatedOrder.delivery_charge,
                    shipping_address: updatedOrder.shipping_address
                });
                io.emit('customer_intel_updated', { number: updatedOrder.customer_number, action: 'meta_ltv_sync' });
            }
        }
        res.json({ success: true, ...result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/oms/orders/:id/send-memo', async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await db.getOrderById(orderId);
        
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
        if (!order.customer_number) return res.status(400).json({ success: false, error: 'Customer number missing' });

        const history = await db.getOrderPayments(orderId);
        const cleanNumber = phoneFormatter.formatNumber(order.customer_number);
        const chatId = `${cleanNumber}@c.us`;

        let itemsList = '';
        const itemsArray = JSON.parse(order.items || '[]');
        itemsArray.forEach(it => {
            const variantStr = it.variant && it.variant !== 'None' ? ` [${it.variant}]` : '';
            const itemPrice = parseFloat(it.price?.toString().replace(/[^0-9.]/g, '') || 0);
            const itemQty = it.qty || 1;
            const itemTotal = itemPrice * itemQty;
            itemsList += `▫️ *${it.name}*${variantStr}\n   ৳${itemPrice.toLocaleString()} x ${itemQty} = *৳${itemTotal.toLocaleString()}*\n`;
        });

        // Financial Logic
        const subtotal = itemsArray.reduce((acc, it) => acc + (parseFloat(it.price?.toString().replace(/[^0-9.]/g, '') || 0) * (it.qty || 1)), 0);
        const delivery = order.delivery_charge || 0;
        const discount = order.discount || 0;
        const prevDue = order.due_added || 0;
        const totalInvoice = subtotal + delivery + prevDue - discount;
        const amountPaid = order.amount_paid || 0;
        
        const isTransferred = isCurrentlyTransferred(order.order_notes);
        const netBalance = isTransferred ? 0 : (totalInvoice - amountPaid);

        // Build Payment History String
        let historySection = '';
        if (history && history.length > 0) {
            historySection = `\n💰 *Payment History:*`;
            history.forEach((p) => {
                const dateString = new Date(p.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                historySection += `\n   └ ${dateString}: *৳${p.amount.toLocaleString()}* (${p.notes || p.method})`;
            });
            historySection += `\n`;
        }

        // Summary Lines
        let summaryLines = `Subtotal: ৳${subtotal.toLocaleString()}\n`;
        summaryLines += `Delivery: ৳${delivery.toLocaleString()}\n`;
        if (discount > 0) summaryLines += `Discount: -৳${discount.toLocaleString()}\n`;
        if (prevDue > 0) summaryLines += `Previous Due: +৳${prevDue.toLocaleString()}\n`;
        
        const successorMatches = [...(order.order_notes || '').matchAll(/New Order #(\d+)/g)];
        const successorId = successorMatches.length > 0 ? successorMatches[successorMatches.length - 1][1] : null;
        const transferNote = isTransferred ? `\n⚠️ *Note:* Remaining balance was moved to Order #${successorId || 'a newer order'}.` : '';

        const memo = `*ORDER MEMO - #${order.id}*
──────────────────────
👤 *Customer:* ${order.customer_name || 'Guest'}
📱 *Contact:* ${cleanNumber}
📅 *Date:* ${new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}

📦 *Order Items:*
${itemsList}
──────────────────────
📋 *Financial Summary:*
${summaryLines}*Total Invoice: ৳${totalInvoice.toLocaleString()}*
*Total Paid: ৳${amountPaid.toLocaleString()}*
${historySection}
⭐ *NET BALANCE: ৳${netBalance.toLocaleString()}*
${transferNote}
──────────────────────
Thank you for shopping with us! 🙏`;

        await db.addOutgoingQueue(chatId, memo, null, {}, {
            customer_number: cleanNumber,
            contactName: order.customer_name || 'Customer',
            isSystemMemo: true
        });

        res.json({ success: true, message: 'Premium Memo Sent' });
    } catch (e) {
        console.error("[OMS] Premium Memo Error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/ai-brain/knowledge', async (req, res) => {
    try {
        const { pinned_items, ...docData } = req.body;
        const result = await db.addKnowledgeDocument(docData);
        if (pinned_items && Array.isArray(pinned_items)) {
            await db.syncKnowledgePins(result.id, pinned_items);
        }
        res.json({ success: true, id: result.id });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/ai-brain/knowledge/:id', async (req, res) => {
    try {
        const { pinned_items, ...docData } = req.body;
        // nullify embedding so it regenerates
        await db.updateKnowledgeDocument(req.params.id, { ...docData, embedding: null });
        if (pinned_items && Array.isArray(pinned_items)) {
            await db.syncKnowledgePins(req.params.id, pinned_items);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/ai-brain/knowledge/:id', async (req, res) => {
    try {
        await db.deleteKnowledgeDocument(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/knowledge/tune', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ success: false, error: 'Text is required' });
        
        const result = await aiService.tuneKnowledge(text);
        res.json({ success: true, refined: result.finalOutput });
    } catch (e) { 
        console.error("[Server] Magic Tune Error:", e);
        res.status(500).json({ success: false, error: e.message }); 
    }
});

app.post('/api/ai-brain/knowledge/bulk', async (req, res) => {
    try {
        const { csvText } = req.body;
        const processId = `knowledge_bulk_${Date.now()}`;
        const bulkService = require('./knowledge-bulk-service');
        
        io.emit('process_start', { id: processId, title: 'Bulk CSV Import', total: 100 });
        
        bulkService.processCSV(csvText, (msg, type, current, total) => {
            io.emit('process_update', { id: processId, message: msg, type });
            io.emit('process_progress', { id: processId, current, total });
        }).then(count => {
            io.emit('process_end', { id: processId, status: 'completed', message: `Successfully imported ${count} documents.` });
            io.emit('knowledge_changed');
        }).catch(err => {
            io.emit('process_end', { id: processId, status: 'failed', message: `Import Failed: ${err.message}` });
        });

        res.json({ success: true, id: processId });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/knowledge/scrape', async (req, res) => {
    try {
        const { url } = req.body;
        const processId = `knowledge_scrape_${Date.now()}`;
        const bulkService = require('./knowledge-bulk-service');
        
        io.emit('process_start', { id: processId, title: 'Site Intelligent Scrape', total: 100 });
        
        bulkService.scrapeWebsiteToKnowledge(url, processId, (msg, type, current, total) => {
            io.emit('process_update', { id: processId, message: msg, type });
            io.emit('process_progress', { id: processId, current, total });
        }).then(count => {
            io.emit('process_end', { id: processId, status: 'completed', message: `Successfully ingested ${count} nodes from ${url}.` });
            io.emit('knowledge_changed');
        }).catch(err => {
            io.emit('process_end', { id: processId, status: 'failed', message: `Scrape Failed: ${err.message}` });
        });

        res.json({ success: true, id: processId });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/sync', async (req, res) => {
    try {
        const processId = `ai_brain_sync_${Date.now()}`;

        // Initial process state
        cancelledProcesses.delete(processId);

        // Emit start event
        io.emit('process_start', {
            id: processId,
            title: 'AI Brain Hub Sync',
            total: 50 // Default max pages estimate
        });

        // Trigger crawler in background with processId
        require('./crawler-service').runBackgroundCrawl(processId);

        res.json({ success: true, message: "Sync process started in the background.", id: processId });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/vectors/sync-products', async (req, res) => {
    try {
        const vs = require('./vector-service');

        // 🔒 STRICT GUARD: Reject if a sync is already running
        if (vs.isSyncing) {
            console.warn('[Server] ⚠️ [GUARD] Product vector sync already in progress. Rejecting duplicate request.');
            return res.status(409).json({ success: false, error: 'A vector sync is already in progress. Please wait.' });
        }

        const processId = `vector_sync_products_${Date.now()}`;
        cancelledProcesses.delete(processId);

        // Log who triggered this (IP + timestamp for traceability)
        console.log(`[Server] 🚨 Product Vector Sync TRIGGERED at ${new Date().toISOString()} from IP: ${req.ip}`);

        io.emit('process_start', { id: processId, title: 'Product Vector Sync', total: 100 });
        vs.syncProductsEmbeddings((msg, type) => {
            io.emit('process_update', { id: processId, message: msg, type });
        }).then(updated => {
            io.emit('process_end', { id: processId, status: 'completed', message: `Sync Complete: ${updated} products vectorized.` });
            io.emit('intelligent_products_changed');
        }).catch(err => {
            io.emit('process_end', { id: processId, status: 'failed', message: `Sync Failed: ${err.message}` });
        });
        res.json({ success: true, id: processId });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/vectors/sync-profile', async (req, res) => {
    try {
        const processId = `vector_sync_profile_${Date.now()}`;
        cancelledProcesses.delete(processId);
        io.emit('process_start', { id: processId, title: 'Profile Vector Sync', total: 1 });
        const vs = require('./vector-service');
        vs.syncProfileEmbedding((msg, type) => {
            io.emit('process_update', { id: processId, message: msg, type });
        }).then(updated => {
            io.emit('process_end', { id: processId, status: 'completed', message: `Profile Vectorized Successfully.` });
        }).catch(err => {
            io.emit('process_end', { id: processId, status: 'failed', message: `Profile Sync Failed: ${err.message}` });
        });
        res.json({ success: true, id: processId });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/vectors/sync-knowledge', async (req, res) => {
    try {
        const processId = `vector_sync_knowledge_${Date.now()}`;
        cancelledProcesses.delete(processId);
        io.emit('process_start', { id: processId, title: 'Knowledge Vector Sync', total: 10 });
        const vs = require('./vector-service');
        vs.syncKnowledgeEmbeddings((msg, type) => {
            io.emit('process_update', { id: processId, message: msg, type });
        }).then(updated => {
            io.emit('process_end', { id: processId, status: 'completed', message: `Knowledge Sync Complete: ${updated} fragments.` });
        }).catch(err => {
            io.emit('process_end', { id: processId, status: 'failed', message: `Knowledge Sync Failed: ${err.message}` });
        });
        res.json({ success: true, id: processId });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Alias for global sync (backward compatibility)
app.post('/api/ai-brain/vectors/sync', async (req, res) => {
    res.redirect(307, '/api/ai-brain/vectors/sync-products');
});

// --- Intelligence Evolution APIs ---
app.post('/api/ai-brain/simulate', async (req, res) => {
    try {
        const { text, number } = req.body;
        const profile = await db.getBusinessProfile();
        const history = await db.getConversationContext(number || 'tester', 5);
        
        // Detailed Trace
        const contextStr = await vectorService.getUnifiedContext(text, number);
        const aiResult = await aiService.generateAutoReply({
            context: contextStr,
            history: history,
            userMessage: text,
            businessName: profile.company_name
        });

        res.json({
            success: true,
            query: text,
            response: aiResult.reply,
            handover: aiResult.handover,
            action: aiResult.action,
            context: contextStr,
            history: history
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/intelligent-intents', async (req, res) => {
    try {
        const intents = await db.getIntents();
        res.json({ success: true, intents });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/intelligent-intents', async (req, res) => {
    try {
        const result = await db.addIntent(req.body);
        res.json({ success: true, id: result.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/intelligent-intents/:id', async (req, res) => {
    try {
        await db.deleteIntent(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Database APIs (No changes needed) ---
app.get('/customers', async (req, res) => { 
    try { 
        const customers = await db.getCustomers();
        // For performance, we'll only augment if specifically requested or keep it lightweight
        // But for OMS search, accuracy is key.
        const orders = await db.getOrders(); // Get all orders to calculate balances
        
        const augmented = customers.map(cust => {
            const customerOrders = (orders || []).filter(o => o.customer_number === cust.number && !['cancelled', 'delivered', 'merged'].includes(o.status));
            const latestOrder = customerOrders.length > 0 ? customerOrders[0] : null;
            
            let activeOrdersBalance = 0;
            if (latestOrder) {
                const total = parseFloat(latestOrder.total_amount?.toString().replace(/[^0-9.]/g, '')) || 0;
                const paid = parseFloat(latestOrder.amount_paid) || 0;
                activeOrdersBalance = Math.max(0, total - paid);
            }

            return {
                ...cust,
                previous_due: (parseFloat(cust.previous_due) || 0) + activeOrdersBalance
            };
        });

        res.json(augmented); 
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    } 
});
app.post('/customers', async (req, res) => {
    try {
        const result = await db.addCustomer({
            name: req.body.name,
            number: req.body.number,
            email: req.body.email,
            address: req.body.address,
            city: req.body.city,
            companyName: req.body.companyName,
            lastPurchase: req.body.lastPurchase
        });
        res.json({ success: true, id: result.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/messages', async (req, res) => {
    try {
        if (req.query.paginated === 'true') {
            const result = await db.getMessagesPaginated({
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 50,
                status: req.query.status,
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo,
                search: req.query.search,
                campaignId: req.query.campaignId,
                templateId: req.query.templateId,
                mediaType: req.query.mediaType
            });
            res.json(result);
        } else {
            res.json(await db.getMessages());
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/messages/bulk-delete', async (req, res) => {
    const { messageIds } = req.body;
    if (!messageIds || !Array.isArray(messageIds)) return res.status(400).json({ error: 'Message IDs required' });
    try {
        const result = await db.bulkDeleteMessages(messageIds);
        io.emit('messages_deleted', { ids: messageIds });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Customer
app.put('/customers', async (req, res) => {
    const { id, name, number, email, address, city, companyName, lastPurchase } = req.body;
    if (!id) return res.status(400).json({ error: 'ID is required' });
    try {
        await db.updateCustomer(id, { name, number, email, address, city, companyName, lastPurchase });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Customer Tags
app.put('/api/contacts/:id/tags', async (req, res) => {
    try {
        await db.updateCustomerTags(req.params.id, req.body.tags);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Customer Score
app.put('/api/contacts/:id/score', async (req, res) => {
    try {
        await db.updateCustomerScore(req.params.id, req.body.score);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- De-duplication APIs ---
app.get('/api/contacts/duplicates', async (req, res) => {
    try {
        const duplicates = await db.getDuplicates();
        res.json(duplicates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/contacts/merge', async (req, res) => {
    const { primaryId, duplicateIds } = req.body;
    if (!primaryId || !duplicateIds || !Array.isArray(duplicateIds)) {
        return res.status(400).json({ error: 'Primary ID and Duplicate IDs array are required' });
    }
    try {
        await db.mergeContacts(primaryId, duplicateIds);
        res.json({ success: true });
    } catch (err) {
        console.error('Merge Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- Analytics APIs ---
app.get('/api/analytics/templates', async (req, res) => {
    try {
        const { id, startDate, endDate } = req.query;
        const stats = await db.getTemplateAnalytics(id, startDate, endDate);
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/analytics/templates/:id/details', async (req, res) => {
    try {
        const details = await db.getTemplateInteractionDetails(req.params.id);
        res.json(details);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/analytics/peak-hours', async (req, res) => {
    try {
        const { id, startDate, endDate } = req.query;
        const stats = await db.getPeakHourAnalytics(id, startDate, endDate);
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- AI Brain Order APIs ---
app.get('/api/ai-brain/orders', async (req, res) => {
    try {
        const orders = await db.getOrders(req.query.number);
        res.json(orders);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ai-brain/orders', async (req, res) => {
    try {
        const orderData = req.body;
        const result = await db.addOrder(orderData);
        
        // [CRM EVOLUTION] CRM Sync Hook: Automatically update customer profile from order
        if (orderData.customer_number) {
            const amount = parseFloat(orderData.total_amount) || 0;
            
            // 1. Recalculate LTV and ensure stage is 'customer'
            await db.recalculateCustomerLTV(orderData.customer_number);
            
            // 2. Enrich profile with shipping info (if available)
            if (orderData.shipping_details) {
                const { address, city, email, name } = orderData.shipping_details;
                await db.updateCustomerIntel(orderData.customer_number, {
                    address, city, email, name,
                    lifecycle_stage: 'customer'
                });
            }
            
            io.emit('customer_intel_updated', { number: orderData.customer_number, action: 'order_sync' });
        }

        res.json({ success: true, id: result.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/ai-brain/orders/:id/payment', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.updateOrderPayment(id, req.body);
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Finance & Expense APIs ──────────────────────────────────────────
app.get('/api/ai-brain/expenses', async (req, res) => {
    try {
        const { from, to } = req.query;
        const expenses = await db.getExpenses(from, to);
        res.json({ success: true, expenses });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/ai-brain/expenses', async (req, res) => {
    try {
        const result = await db.addExpense(req.body);
        io.emit('expenses_updated');
        res.json({ success: true, id: result.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ai-brain/expenses/:id', async (req, res) => {
    try {
        await db.deleteExpense(req.params.id);
        io.emit('expenses_updated');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ai-brain/finance-overview', async (req, res) => {
    try {
        const { from, to } = req.query;
        const stats = await db.getFinanceOverview(from, to);
        res.json({ success: true, stats });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/analytics/media-performance', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const stats = await db.getMediaPerformanceAnalytics(startDate, endDate);
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/analytics/audience-performance', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const stats = await db.getAudiencePerformanceAnalytics(startDate, endDate);
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Original template management APIs below...
app.get('/api/templates', async (req, res) => {
    try {
        res.json(await db.getTemplates());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/templates/:id', async (req, res) => {
    try {
        const template = await db.getTemplateById(req.params.id);
        if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
        res.json({ success: true, template });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/templates', async (req, res) => {
    const { title, content, category, media_path, media_type, attachments } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and Content are required' });
    try {
        const result = await db.addTemplate(title, content, category, media_path, media_type, attachments);
        // SIS: Protect assets
        if (media_path) await db.markAssetProtected(media_path, true);
        if (attachments && Array.isArray(attachments)) {
            for (const att of attachments) if (att.url) await db.markAssetProtected(att.url, true);
        }
        io.emit('templates_updated');
        res.json({ success: true, id: result.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/templates/:id', async (req, res) => {
    const { title, content, category, media_path, media_type, attachments } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and Content are required' });
    try {
        await db.updateTemplate(req.params.id, title, content, category, media_path, media_type, attachments);
        // SIS: Protect new assets
        if (media_path) await db.markAssetProtected(media_path, true);
        if (attachments && Array.isArray(attachments)) {
            for (const att of attachments) if (att.url) await db.markAssetProtected(att.url, true);
        }
        io.emit('templates_updated');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


app.delete('/api/templates/:id', async (req, res) => {
    try {
        await db.deleteTemplate(req.params.id);
        io.emit('templates_updated');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/templates/:id/record-usage', async (req, res) => {
    try {
        await db.incrementTemplateUsage(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/templates/:id/pin', async (req, res) => {
    try {
        const { is_pinned } = req.body;
        await db.toggleTemplatePin(req.params.id, is_pinned);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/* Bot Rules APIs removed */

// Unified Send API (Legacy or External Support)
app.post('/send-message', async (req, res) => {
    let { number, message } = req.body;
    const cleanNumber = phoneFormatter.formatNumber(number);
    if (!cleanNumber || !message) return res.status(400).json({ error: 'Number and message required' });

    // Check service state
    if (waStatus.state !== 'ready') return res.status(503).json({ error: 'WhatsApp service not ready' });

    // Emulate socket call to service
    io.emit('service_send_message', {
        chatId: `${cleanNumber}@c.us`, text: message, to: cleanNumber
    });
    res.json({ success: true, note: 'Message queued to service' });
});

// --- Group & Contact Management ---
app.get('/api/groups', async (req, res) => {
    try {
        const groups = await db.getGroups();
        // Add contact count for each group
        const groupsWithCount = await Promise.all(groups.map(async (g) => {
            const contacts = await db.getContactsByGroup(g.id);
            return { ...g, contactCount: contacts.length };
        }));
        res.json(groupsWithCount);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/groups', async (req, res) => {
    const { name, description } = req.body;
    try {
        const result = await db.addGroup(name, description);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/groups/:id', async (req, res) => {
    try {
        await db.deleteGroup(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/groups/:id/contacts', async (req, res) => {
    try {
        const contacts = await db.getContactsByGroup(req.params.id);
        res.json(contacts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/groups/:id/contacts/sync', async (req, res) => {
    const { contactIds } = req.body;
    try {
        await db.syncGroupContacts(req.params.id, contactIds);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/groups/:id/contacts/bulk-add', async (req, res) => {
    const { contactIds } = req.body;
    try {
        for (const contactId of contactIds) {
            await db.addContactToGroup(contactId, req.params.id);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Remove a contact from a specific group
// Query param: ?mode=group_only  → remove from group only (contact stays in system)
// Query param: ?mode=full_delete → permanently delete the contact from the entire system
app.delete('/api/groups/:groupId/contacts/:contactId', async (req, res) => {
    const { groupId, contactId } = req.params;
    const mode = req.query.mode || 'group_only';
    if (!['group_only', 'full_delete'].includes(mode)) {
        return res.status(400).json({ error: 'mode must be group_only or full_delete' });
    }
    try {
        if (mode === 'full_delete') {
            await db.deleteCustomer(contactId);
        } else {
            await db.removeContactFromGroup(contactId, groupId);
        }
        res.json({ success: true, mode });
    } catch (err) {
        console.error('[Hub] Remove contact from group error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/contacts/bulk', async (req, res) => {
    const { contacts, groupId } = req.body;
    try {
        const results = await db.bulkAddContactsWithGroup(contacts, groupId);
        res.json({ success: true, count: results.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/contacts/stats', async (req, res) => {
    try {
        const stats = await db.getContactStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/contacts/profile/:number', async (req, res) => {
    try {
        const number = req.params.number;
        const contact = await db.getCustomerByNumber(number);
        if (!contact) return res.status(404).json({ error: 'Contact not found' });
        
        const contactHistory = await db.getContactHistory(contact.id);
        const orders = await db.getOrders(number);
        const financialDNA = await db.getCustomerFinancialDNA(number);
        const financialLedger = await db.getCustomerFinancialLedger(number);
        
        // Dynamic Balance Calculation: Take only the LATEST active order's balance to avoid double-counting
        const activeOrders = (orders || []).filter(o => !['cancelled', 'delivered', 'merged'].includes(o.status));
        const latestOrder = activeOrders.length > 0 ? activeOrders[0] : null;
        
        let activeOrdersBalance = 0;
        if (latestOrder) {
            const total = parseFloat(latestOrder.total_amount?.toString().replace(/[^0-9.]/g, '')) || 0;
            const paid = parseFloat(latestOrder.amount_paid) || 0;
            activeOrdersBalance = Math.max(0, total - paid);
        }

        // Augment contact with real-time active balance
        contact.previous_due = (parseFloat(contact.previous_due) || 0) + activeOrdersBalance;
        
        if (contact) {
            contact.phone = contact.number; // Compatibility for frontend
        }
        
        res.json({
            success: true,
            contact,
            history: contactHistory.history, // Extract only the history array
            orders,
            financialDNA,
            financialLedger
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/contacts/financial-dna/:number', async (req, res) => {
    try {
        const dna = await db.getCustomerFinancialDNA(req.params.number);
        res.json({ success: true, dna });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/contacts/financial-ledger/:number', async (req, res) => {
    try {
        const ledger = await db.getCustomerFinancialLedger(req.params.number);
        res.json({ success: true, ledger });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/contacts/:number/addresses', async (req, res) => {
    try {
        const { action, addressData } = req.body;
        const result = await db.manageSavedAddress(req.params.number, action, addressData);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/contacts/:id/tags', async (req, res) => {
    try {
        const { tags } = req.body;
        await db.updateCustomerTags(req.params.id, tags);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/contacts/:id/history', async (req, res) => {
    try {
        const history = await db.getContactHistory(req.params.id);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/contacts/history-by-phone/:phone', async (req, res) => {
    try {
        const history = await db.getContactHistoryByPhone(req.params.phone);
        res.json(history);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- AI Template & Content Refinement ---
app.post('/api/ai/generate', async (req, res) => {
    const { prompt, category, useSpintax } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    try {
        const content = await aiService.generateTemplate(prompt, category, useSpintax);
        res.json({ success: true, content });
    } catch (err) {
        console.error('[Hub] AI error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ai-brain/knowledge/tune', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    try {
        const refined = await aiService.tuneKnowledge(text);
        res.json({ success: true, refined });
    } catch (err) {
        console.error('[Hub] AI Knowledge Tune error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/contacts/bulk-delete', async (req, res) => {
    const { contactIds } = req.body;
    if (!contactIds || !Array.isArray(contactIds)) return res.status(400).json({ error: 'Contact IDs required' });

    const processId = `delete_contacts_${Date.now()}`;
    cancelledProcesses.delete(processId);
    res.json({ success: true, message: 'Bulk delete started', id: processId });

    // Start process modal
    io.emit('process_start', { id: processId, title: 'Deleting Contacts', total: contactIds.length });

    const BATCH_SIZE = 250; // SQLite Transaction Batch
    const UPDATE_INTERVAL = 10; // Progress UI Interval
    let totalDeleted = 0;

    const processBulk = async () => {
        for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
            if (cancelledProcesses.has(processId)) {
                cancelledProcesses.delete(processId);
                io.emit('process_end', { status: 'failed', message: 'Deletion cancelled by user.' });
                return;
            }
            const batch = contactIds.slice(i, i + BATCH_SIZE);
            try {
                // Perform deletion in transactional batches for speed
                const result = await db.bulkDeleteCustomers(batch);

                // Detailed progress updates for UI (Hybrid feel)
                for (let j = 0; j < batch.length; j++) {
                    totalDeleted++;
                    if (totalDeleted % UPDATE_INTERVAL === 0 || totalDeleted === contactIds.length) {
                        io.emit('process_update', {
                            message: `Deleting: ${totalDeleted}/${contactIds.length} 🗑️`,
                            type: 'success',
                            current: totalDeleted
                        });
                    }
                }
            } catch (err) {
                console.error(`[Hub] Batch delete error at index ${i}:`, err);
                io.emit('process_update', {
                    message: `Error in batch deletion: ${err.message}`,
                    type: 'error',
                    current: totalDeleted
                });
            }
        }

        io.emit('process_end', {
            status: 'completed',
            message: `Successfully deleted ${totalDeleted} contacts using Hybrid-Dynamic engine.`
        });

        // Notify frontend to refresh
        io.emit('sync_status', { type: 'contacts', success: true, count: totalDeleted });
    };

    processBulk();
});

app.delete('/api/contacts/:id', async (req, res) => {
    try {
        await db.deleteCustomer(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/messages/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Use dbUtils.getMessageById (Promise-based) — fixes "db.get is not a function" bug
        const message = await db.getMessageById(id);

        if (!message || !message.whatsapp_id) {
            return res.status(404).json({ error: 'Message not found or no WhatsApp ID associated' });
        }

        // Emit delete event to WhatsApp service
        io.emit('service_delete_message', { whatsappId: message.whatsapp_id });

        // Listen for result from WA service with a timeout
        const resultPromise = new Promise((resolve) => {
            const handler = (data) => {
                if (data.whatsappId === message.whatsapp_id) {
                    io.off('service_delete_result', handler);
                    resolve(data);
                }
            };
            io.on('service_delete_result', handler);
            // Timeout after 10s — resolve with failure so we don't hang
            setTimeout(() => {
                io.off('service_delete_result', handler);
                resolve({ success: false, error: 'Request timed out waiting for WhatsApp service' });
            }, 10000);
        });

        const result = await resultPromise;

        if (result.success) {
            // Delete from local database using dbUtils — fixes "db.run is not a function" bug
            await db.deleteMessage(id);

            // Broadcast deletion to all connected clients
            io.emit('message_deleted', { id, whatsappId: message.whatsapp_id });

            res.json({ success: true, message: 'Message deleted from both sides' });
        } else {
            res.status(500).json({ error: result.error || 'Failed to delete message from WhatsApp' });
        }
    } catch (err) {
        console.error('[Hub] Message delete error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── Smart Bulk Delete APIs ───────────────────────────────────────────────────

/**
 * POST /api/messages/delete-candidates/preview
 * Returns the list of messages that would be deleted based on filters.
 * Body: { templateIds: number[], statusFilter: string, numbers?: string[] }
 */
app.post('/api/messages/delete-candidates/preview', async (req, res) => {
    const { templateIds, statusFilter = 'all', numbers = [] } = req.body;
    if (!templateIds || !Array.isArray(templateIds) || templateIds.length === 0) {
        return res.status(400).json({ error: 'templateIds array is required' });
    }
    try {
        const candidates = await db.getDeleteCandidates(templateIds, statusFilter, numbers);
        res.json({ success: true, count: candidates.length, candidates });
    } catch (err) {
        console.error('[Hub] Smart Delete Preview error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/messages/bulk-delete
 * Bulk delete messages from WhatsApp by their whatsapp_ids.
 * Body: { whatsappIds: string[] }
 * Uses ProcessModal on frontend via socket events.
 */
app.post('/api/messages/bulk-delete', async (req, res) => {
    const { whatsappIds } = req.body;
    if (!whatsappIds || !Array.isArray(whatsappIds) || whatsappIds.length === 0) {
        return res.status(400).json({ error: 'whatsappIds array is required' });
    }

    const processId = `bulk_delete_msgs_${Date.now()}`;
    cancelledProcesses.delete(processId);

    // Respond immediately so frontend can show the process modal
    res.json({ success: true, message: 'Bulk delete started', total: whatsappIds.length, id: processId });

    io.emit('process_start', { id: processId, title: 'Smart Bulk Delete', total: whatsappIds.length });

    const DELAY_MS = 1500; // 1.5s per message — prevents WhatsApp ban
    let deletedCount = 0;
    let failedCount = 0;

    const processBulkDelete = async () => {
        for (let i = 0; i < whatsappIds.length; i++) {
            if (cancelledProcesses.has(processId)) {
                cancelledProcesses.delete(processId);
                io.emit('process_end', { status: 'failed', message: 'Bulk deletion cancelled by user.' });
                return;
            }
            const whatsappId = whatsappIds[i];

            try {
                // Emit delete request to WA service
                io.emit('service_delete_message', { whatsappId });

                // Wait for the service to confirm deletion (max 8s timeout)
                const result = await new Promise((resolve) => {
                    const handler = (data) => {
                        if (data.whatsappId === whatsappId) {
                            io.off('service_delete_result', handler);
                            resolve(data);
                        }
                    };
                    io.on('service_delete_result', handler);
                    setTimeout(() => {
                        io.off('service_delete_result', handler);
                        resolve({ success: false, error: 'Timeout' });
                    }, 8000);
                });

                if (result.success) {
                    // Remove from local DB
                    await new Promise((resolve) => {
                        db.run('DELETE FROM messages WHERE whatsapp_id = ?', [whatsappId], () => resolve());
                    });
                    deletedCount++;
                    io.emit('process_update', {
                        message: `Deleted ${deletedCount}/${whatsappIds.length} messages 🗑️`,
                        type: 'success',
                        current: i + 1
                    });
                    // Notify all clients to remove the message from UI
                    io.emit('message_deleted', { id: null, whatsappId });
                } else {
                    failedCount++;
                    io.emit('process_update', {
                        message: `Failed: ${whatsappId.slice(-6)} — ${result.error || 'Unknown error'}`,
                        type: 'error',
                        current: i + 1
                    });
                }
            } catch (err) {
                failedCount++;
                console.error(`[Hub] Bulk delete error for ${whatsappId}:`, err.message);
                io.emit('process_update', {
                    message: `Error on message ${i + 1}: ${err.message}`,
                    type: 'error',
                    current: i + 1
                });
            }

            // Rate-limit delay between messages to prevent WhatsApp ban
            if (i < whatsappIds.length - 1) {
                await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            }
        }

        const statusMsg = failedCount === 0
            ? `✅ Successfully deleted ${deletedCount} messages.`
            : `Deleted ${deletedCount}, Failed ${failedCount} messages.`;

        io.emit('process_end', {
            status: failedCount === 0 ? 'completed' : 'failed',
            message: statusMsg
        });
    };

    processBulkDelete();
});

/**
 * POST /api/messages/template-send-groups
 * Returns recipients grouped by template + send_date.
 * Used to power the "Campaign Date Chooser" popup + recipient checkboxes.
 * Body: { templateIds: number[] }
 */
app.post('/api/messages/template-send-groups', async (req, res) => {
    const { templateIds } = req.body;
    if (!templateIds || !Array.isArray(templateIds) || templateIds.length === 0) {
        return res.status(400).json({ error: 'templateIds array is required' });
    }
    try {
        const groups = await db.getTemplateSendGroups(templateIds);
        res.json({ success: true, groups });
    } catch (err) {
        console.error('[Hub] template-send-groups error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── Scheduled Campaigns APIs ───────────────────────────────────────────────────────────────

/**
 * POST /api/campaigns/schedule
 * Create a new scheduled campaign.
 * Body: { name, message, target_type, target_id, target_name, scheduled_at, total_recipients }
 */
app.post('/api/campaigns/schedule', async (req, res) => {
    const { name, message, target_type, target_id, target_name, scheduled_at, total_recipients, template_id } = req.body;

    if (!name || !message || !target_type || !target_id || !scheduled_at) {
        return res.status(400).json({
            error: 'name, message, target_type, target_id, and scheduled_at are required'
        });
    }
    if (!['contact', 'group'].includes(target_type)) {
        return res.status(400).json({ error: 'target_type must be "contact" or "group"' });
    }

    // Ensure scheduled_at is in the future
    const scheduledDate = new Date(scheduled_at);
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
        return res.status(400).json({ error: 'scheduled_at must be a valid future datetime' });
    }

    try {
        const result = await db.createScheduledCampaign({
            name,
            message,
            target_type,
            target_id,
            target_name: target_name || null,
            scheduled_at: scheduledDate.toISOString(),
            total_recipients: total_recipients || 0,
            template_id: template_id || null,
            delayMin: req.body.delayMin,
            delayMax: req.body.delayMax,
            execution_windows: req.body.executionWindows,
            respect_execution_windows: req.body.respectExecutionWindows !== undefined ? (req.body.respectExecutionWindows ? 1 : 0) : 1
        });
        io.emit('scheduled_campaigns_changed');
        res.json({ success: true, id: result.id });
    } catch (err) {
        console.error('[Hub] Schedule campaign error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/campaigns/scheduled
 * Returns all pending/running scheduled campaigns.
 */
app.get('/api/campaigns/scheduled', async (req, res) => {
    try {
        const showAll = req.query.all === 'true';
        const campaigns = await db.getScheduledCampaigns(showAll);
        res.json({ success: true, campaigns });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/campaigns/scheduled/:id/details
 * Returns individual message logs for a specific campaign.
 */
app.get('/api/campaigns/scheduled/:id/details', async (req, res) => {
    try {
        const messages = await db.getCampaignMessages(req.params.id);
        res.json({ success: true, messages });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/campaigns/active-execution', (req, res) => {
    const state = getActiveExecutionState();
    res.json({ success: true, execution: state });
});

/**
 * PATCH /api/campaigns/scheduled/:id/cancel
 * Cancel a pending scheduled campaign.
 */
app.patch('/api/campaigns/scheduled/:id/cancel', async (req, res) => {
    try {
        const result = await db.cancelScheduledCampaign(req.params.id);
        if (result.success) {
            io.emit('scheduled_campaigns_changed');
            res.json({ success: true });
        } else {
            res.status(409).json({ error: 'Campaign cannot be cancelled (not in pending state)' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PATCH /api/campaigns/scheduled/:id/pause
 */
app.patch('/api/campaigns/scheduled/:id/pause', async (req, res) => {
    try {
        const id = String(req.params.id);
        const result = await db.toggleScheduledCampaignPause(id, true);
        if (result.success) {
            pausedProcesses.set(id, true); // Notify CampaignService engine
            setCampaignPaused(id, true);  // Notify Scheduler engine
            io.emit('scheduled_campaigns_changed');
            io.emit('execution_state_changed', { campaignId: id, state: 'paused' });
            res.json({ success: true });
        } else {
            res.status(409).json({ error: 'Campaign cannot be paused' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PATCH /api/campaigns/scheduled/:id
 * Update a pending scheduled campaign (e.g. message or next scheduled time).
 */
app.patch('/api/campaigns/scheduled/:id', async (req, res) => {
    try {
        const { message, scheduled_at } = req.body;
        const result = await db.updateScheduledCampaign(req.params.id, { message, scheduled_at });

        if (result.success) {
            io.emit('scheduled_campaigns_changed');
            res.json({ success: true });
        } else {
            res.status(409).json({ error: result.error || 'Update failed' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/campaigns/scheduled/:id/resume', async (req, res) => {
    try {
        const id = String(req.params.id);
        const additionalMinutes = parseInt(req.body.additional_minutes) || 0;

        // Prevents redundant resumes if already in the middle of a resume/running
        const currentCampaign = await db.getScheduledCampaignById(id);
        if (currentCampaign && currentCampaign.status !== 'paused') {
            return res.json({ success: true, message: 'Campaign is not paused' });
        }

        const result = await db.resumeScheduledCampaign(id, additionalMinutes);
        if (result.success) {
            pausedProcesses.delete(id); // Notify CampaignService engine
            setCampaignPaused(id, false); // Notify Scheduler engine
            io.emit('scheduled_campaigns_changed');
            io.emit('execution_state_changed', { campaignId: id, state: 'running' });
            res.json({ success: true, newScheduledAt: result.newScheduledAt });
        } else {
            res.status(409).json({ error: result.error || 'Campaign cannot be resumed' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/campaigns/scheduled/:id
 * Hard delete a cancelled/completed/failed campaign from the queue.
 */
app.delete('/api/campaigns/scheduled/:id', async (req, res) => {
    try {
        const result = await db.deleteScheduledCampaign(req.params.id);
        if (result.success) {
            io.emit('scheduled_campaigns_changed');
            res.json({ success: true });
        } else {
            res.status(409).json({ error: 'Campaign cannot be deleted (must be cancelled/completed/failed first)' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/settings/scheduler
 * Returns current scheduler delay settings.
 */
app.get('/api/settings/scheduler', async (req, res) => {
    try {
        const settings = await db.getAllSettings();
        res.json({
            success: true,
            delayMinMs: parseInt(settings.scheduler_delay_min_ms || '8000', 10),
            delayMaxMs: parseInt(settings.scheduler_delay_max_ms || '15000', 10),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PATCH /api/settings/scheduler
 * Updates scheduler delay settings.
 */
app.patch('/api/settings/scheduler', async (req, res) => {
    try {
        const { delayMinMs, delayMaxMs } = req.body;
        await db.setSetting('scheduler_delay_min_ms', delayMinMs);
        await db.setSetting('scheduler_delay_max_ms', delayMaxMs);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/settings
 * Fetch all application settings
 */
// --- AI & Handover Control Endpoints ---
app.post('/api/customers/toggle-ai', async (req, res) => {
    const { number, ai_paused, handover_requested } = req.body;
    try {
        await db.updateCustomerAIStatusByNumber(number, { ai_paused, handover_requested });
        res.json({ success: true });
    } catch (err) {
        console.error('Error toggling customer AI:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/customers/ai-status/:number', async (req, res) => {
    try {
        const status = await db.getCustomerAIStatus(req.params.number);
        res.json({ success: true, status });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/ai-brain/analytics', async (req, res) => {
    try {
        const stats = await db.getAIAnalytics();
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/ai-brain/intelligence-stats', async (req, res) => {
    try {
        const stats = await db.getIntelligenceStats();
        // Include very recent AI logs for the heartbeat feed
        const recentLogs = await db.getAILogs(5, 0);
        res.json({ success: true, stats, heartbeat: recentLogs.logs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/ai-brain/executive-brief', async (req, res) => {
    try {
        const stats = await db.getIntelligenceStats();
        const brief = await aiService.generateIntelligenceBrief(stats);
        res.json({ success: true, brief });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/ai-brain/logs', async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    try {
        const result = await db.getAILogs(limit, offset);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/ai-brain/intent-analytics', async (req, res) => {
    try {
        const analytics = await db.getAIIntentAnalytics();
        res.json({ success: true, analytics });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- AI API Configuration Endpoints ---
app.get('/api/ai-brain/configs', async (req, res) => {
    try {
        const configs = await db.getAIConfigs();
        res.json({ success: true, configs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/ai-brain/configs', async (req, res) => {
    try {
        const result = await db.addAIConfig(req.body);
        res.json({ success: true, id: result.id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/ai-brain/configs/:id', async (req, res) => {
    try {
        await db.updateAIConfig(req.params.id, req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/ai-brain/configs/:id', async (req, res) => {
    try {
        await db.deleteAIConfig(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/ai-brain/configs/:id/logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const result = await db.getAIConfigLogs(req.params.id, limit, offset);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/ai-brain/usage-stats', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const stats = await db.getAIUsageStats(days);
        const configStats = await db.getAIConfigStats();
        res.json({ success: true, stats, configStats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/ai-brain/simulate', async (req, res) => {
    try {
        const { text, number } = req.body;
        if (!text || !number) return res.status(400).json({ success: false, error: 'Text and number are required' });

        const profile = await db.getBusinessProfile();
        const enhancedContext = await db.getEnhancedConversationContext(number, 10);
        const contextStr = await vectorService.getUnifiedContext(text, number);

        const aiResult = await aiService.generateAutoReply({
            context: contextStr,
            history: enhancedContext.fullContext,
            userMessage: text,
            businessName: profile.company_name,
            customerNumber: number
        });

        res.json({
            success: true,
            response: aiResult.reply,
            context: contextStr,
            action: aiResult.action || null,
            handover: aiResult.handover,
            intel: aiResult.intel
        });
    } catch (error) {
        console.error("AI Simulation Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/ai-brain/tune-profile', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ success: false, error: 'Text is required' });
        const tunedText = await aiService.tuneProfileOverview(text);
        res.json({ success: true, tunedText });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Settings & Config
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await db.getAllSettings();
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/settings
 * Update multiple application settings
 */
app.post('/api/settings', async (req, res) => {
    try {
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ error: 'settings object required' });
        }

        for (const [key, value] of Object.entries(settings)) {
            await db.setSetting(key, typeof value === 'string' ? value : JSON.stringify(value));
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


/**
 * GET /api/campaigns/active
 * Get active persistent executions for Floating Controller
 */
app.get('/api/campaigns/active', async (req, res) => {
    try {
        const actives = await db.getActiveExecutions();
        res.json({ success: true, executions: actives });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3001;

/**
 * PRODUCTION-GRADE: Ensures the target port is available by killing 
 * any ghost/orphan processes holding it (Windows Specific).
 */
const ensurePortAvailable = async (port) => {
    if (process.platform !== 'win32') return;

    try {
        const currentPid = process.pid;
        const parentPid = process.ppid;
        const findCmd = `netstat -ano | findstr :${port} | findstr LISTENING`;
        const output = execSync(findCmd, { encoding: 'utf8' }).trim();
        
        if (output) {
            const lines = output.split('\n');
            const pids = new Set();
            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && pid !== '0' && pid !== String(currentPid) && pid !== String(parentPid)) {
                    pids.add(pid);
                }
            });

            for (const pid of pids) {
                console.log(`[Server] ⚠️ Port ${port} is held by PID ${pid}. Attempting cleanup...`);
                try {
                    execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                } catch (e) {}
            }
            
            if (pids.size > 0) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    } catch (e) {}
};

// --- HUMAN-IN-THE-LOOP (HITL) AI CACHE CONTROL APIs ---
app.get('/api/ai/cache-clusters', async (req, res) => {
    try {
        const clusters = await db.getCacheClusters('default');
        res.json({ success: true, clusters });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/ai/cache-analytics', async (req, res) => {
    try {
        const analytics = await db.getCacheAnalytics('default');
        res.json({ success: true, ...analytics });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/ai/cache-clusters/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { responseText, isGolden, intentKey } = req.body;
        const result = await db.updateCacheResponse(id, responseText, isGolden, intentKey);
        res.json({ success: true, ...result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai/cache-clusters/reassign', async (req, res) => {
    try {
        const { id, targetIntent } = req.body;
        const result = await db.reassignCacheIntent(id, targetIntent);
        res.json({ success: true, ...result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/ai/cache-clusters/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.deleteCacheItem(id);
        res.json({ success: true, ...result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai/cache-clusters/add-query', async (req, res) => {
    try {
        const { intentKey, pureQuery, responseText, isGolden } = req.body;
        if (!intentKey || !pureQuery) {
            return res.status(400).json({ success: false, error: 'intentKey and pureQuery are required' });
        }
        await vectorService.setSemanticCachedResponse(
            pureQuery,
            intentKey,
            typeof responseText === 'string' ? JSON.parse(responseText) : (responseText || { reply: 'Default approved answer.' }),
            'default'
        );
        if (isGolden) {
            const cleanQuery = pureQuery.toLowerCase().replace(/[^\w\s\u0980-\u09FF]/gi, '').trim();
            const queryHash = crypto.createHash('md5').update(`default_${cleanQuery}`).digest('hex');
            const item = await db.getCachedAIResponse(queryHash);
            if (item) {
                await db.updateCacheResponse(item.id, item.response_text, 1, intentKey);
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Next-Gen Enterprise Cache Control Studio APIs ──────────────────────────

// 1. Live Cache Simulator
app.post('/api/ai/cache-clusters/test-query', async (req, res) => {
    try {
        const { queryText } = req.body;
        if (!queryText) return res.status(400).json({ success: false, error: 'queryText is required' });

        const DYNAMIC_MATH_PATTERN = /(\d+(\.\d+)?\s*(kg|কেজি|gm|g|গ্রাম|পিস|টি|প্যাক|কেজির|টাকা|হিসাব|দাম কত|মোট কত|কত আসবে|কত টাকা|কত দাম|হিসেব|কয় টাকা|কোয়ান্টিটি|পরিমাণ)|হিসাব|ক্যালকুলেট|হিসেব|মোট কত|দাম কত আসবে|ক্যালকুলেশন)/i;
        const hasNumbersWithUnits = /\d+/.test(queryText) && /(কেজি|kg|gm|গ্রাম|টাকা|দাম|পিস|টি|কত)/i.test(queryText);
        
        if (DYNAMIC_MATH_PATTERN.test(queryText) || hasNumbersWithUnits) {
            return res.json({
                success: true,
                isMathQuery: true,
                hit: false,
                status: 'BYPASS_LIVE_MATH',
                message: '🛑 Dynamic calculation detected! All math/unit queries BYPASS CACHE for 100% accurate AI calculation.'
            });
        }

        const emb = await vectorService.generateEmbedding(queryText);
        const thresholdStr = await db.getSetting('cache_similarity_threshold');
        const threshold = thresholdStr ? parseFloat(thresholdStr) : 0.95;
        const hit = await vectorService.getSemanticCachedResponse(queryText, null, 'default', emb);

        if (hit) {
            return res.json({
                success: true,
                isMathQuery: false,
                hit: true,
                status: 'CACHE_HIT',
                thresholdUsed: threshold,
                response: hit
            });
        }

        res.json({
            success: true,
            isMathQuery: false,
            hit: false,
            status: 'CACHE_MISS',
            thresholdUsed: threshold,
            message: 'No 95%+ vector match found in cache. Will execute Live AI RAG.'
        });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 2. AI Auto-Synonym Generator
app.post('/api/ai/cache-clusters/generate-synonyms', async (req, res) => {
    try {
        const { intentKey, sampleQuery } = req.body;
        const prompt = `Generate 5 natural Bengali customer question phrasings for customer support intent "${intentKey}" based on sample query "${sampleQuery || ''}". Output pure JSON array of strings ONLY: ["q1", "q2", "q3", "q4", "q5"]`;
        const aiService = require('./ai-service');
        const result = await aiService.executeAITask('GENERAL', prompt, 'Respond only with a JSON array.');
        let questions = [];
        try {
            const jsonStr = result.replace(/```json|```/g, '').trim();
            questions = JSON.parse(jsonStr);
        } catch (e) {
            questions = [
                `${sampleQuery || intentKey} সম্পর্কিত তথ্য দিন`,
                `এটার নিয়ম কি?`,
                `ডিটেইলস জানাবেন?`
            ];
        }
        res.json({ success: true, questions });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 3. Bulk Golden Lock
app.post('/api/ai/cache-clusters/bulk-golden', async (req, res) => {
    try {
        const { intentKey, isGolden } = req.body;
        if (!intentKey) return res.status(400).json({ success: false, error: 'intentKey required' });
        await db.runQuery('UPDATE ai_response_cache SET is_golden = ? WHERE intent_key = ?', [isGolden ? 1 : 0, intentKey]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 4. Sensitivity Settings
app.get('/api/ai/cache-settings', async (req, res) => {
    try {
        const threshold = await db.getSetting('cache_similarity_threshold') || '0.95';
        const ttl = await db.getSetting('cache_ttl_mode') || 'PERMANENT';
        res.json({ success: true, threshold: parseFloat(threshold), ttl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/ai/cache-settings', async (req, res) => {
    try {
        const { threshold, ttl } = req.body;
        if (threshold !== undefined) await db.saveSettings({ cache_similarity_threshold: String(threshold) });
        if (ttl !== undefined) await db.saveSettings({ cache_ttl_mode: String(ttl) });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 5. Uncached Real Customer Query Feed ("AI Miss-to-Cache Stream")
app.get('/api/ai/cache-uncached-queries', async (req, res) => {
    try {
        const logs = await db.allQuery(
            `SELECT id, customer_number, query, context, response_text, created_at 
             FROM ai_logs 
             WHERE context NOT LIKE '%[SEMANTIC CACHE HIT]%' 
             ORDER BY id DESC LIMIT 20`
        );
        res.json({ success: true, uncached: logs || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

if (process.env.NODE_ENV !== 'test') {
    let retryAttempts = 0;
    const maxRetryAttempts = 10;

    // 🛡️ Graceful Nodemon Restart & Signal Handlers (Frees port 3001 instantly)
    process.once('SIGUSR2', () => {
        console.log('[Server] 🔄 Nodemon restart signal received. Releasing port 3001...');
        try { server.close(); } catch (e) {}
        process.kill(process.pid, 'SIGUSR2');
    });

    process.on('SIGINT', () => {
        console.log('[Server] 🛑 Shutdown signal received. Releasing port 3001...');
        try { server.close(); } catch (e) {}
        process.exit(0);
    });

    const startServer = async () => {
        try {
            await ensurePortAvailable(PORT);
            
            const listenWithRetry = () => {
                server.listen(PORT, async () => {
                    console.log(`API Server running on port ${PORT}`);
                    retryAttempts = 0; // Reset counter on clean bind
                    initScheduler(io, db);
                    require('./crawler-service').start();

                    // Recover stuck campaigns
                    try {
                        await campaignService.recoverCampaigns();
                    } catch (e) {
                        console.error('Failed to recover campaigns:', e);
                    }

                    // --- Daily SIS Cleanup Service (Runs at 3 AM) ---
                    const cron = require('node-cron');
                    cron.schedule('0 3 * * *', async () => {
                        console.log('[SIS] Starting daily media cleanup...');
                        try {
                            const dbRef = require('./db');
                            const assets = await dbRef.dbAll(`SELECT * FROM media_assets WHERE is_protected = 0`);
                            const now = Date.now();
                            const maxAge = 30 * 24 * 60 * 60 * 1000;

                            for (const asset of assets) {
                                const filePath = path.join(__dirname, asset.url.replace('/uploads/', 'uploads/'));
                                if (fs.existsSync(filePath)) {
                                    const stats = fs.statSync(filePath);
                                    if (now - stats.mtimeMs > maxAge) {
                                        console.log(`[SIS] Deleting old unprotected asset: ${asset.url}`);
                                        fs.unlinkSync(filePath);
                                        await dbRef.dbRun(`DELETE FROM media_assets WHERE hash = ?`, [asset.hash]);
                                    }
                                } else {
                                    await dbRef.dbRun(`DELETE FROM media_assets WHERE hash = ?`, [asset.hash]);
                                }
                            }
                        } catch (err) {
                            console.error('[SIS] Cleanup Error:', err);
                        }
                    });
                });
            };

            server.on('error', async (err) => {
                if (err.code === 'EADDRINUSE') {
                    retryAttempts++;
                    console.warn(`[Server] ⚠️ Port ${PORT} in use (Attempt ${retryAttempts}/${maxRetryAttempts}). Retrying in 1.5s after OS release...`);
                    await ensurePortAvailable(PORT);
                    if (retryAttempts < maxRetryAttempts) {
                        setTimeout(() => {
                            try {
                                server.close(() => {
                                    listenWithRetry();
                                });
                            } catch (e) {
                                try { listenWithRetry(); } catch (err2) {}
                            }
                        }, 1500);
                    } else {
                        console.error(`[Server] 🚨 Critical: Could not bind port ${PORT} after ${maxRetryAttempts} retries.`);
                    }
                }
            });

            listenWithRetry();
        } catch (err) {
            console.error('[Server] Failed to start:', err);
        }
    };

    startServer();
}

module.exports = app;
