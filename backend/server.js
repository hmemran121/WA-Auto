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
require('dotenv').config();

// Configure Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

let waStatus = { state: 'disconnected', data: null, error: null };

const debugLog = (msg) => {
    try { fs.appendFileSync(path.join(__dirname, 'debug.log'), `[${new Date().toISOString()}] ${msg}\n`); } catch (e) { }
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

const crypto = require('crypto');

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



        // Smart Sync: Automagically save/update customer
        try {
            await db.syncCustomer(notifyName, from);
        } catch (syncErr) {
            console.error('[Hub] Sync Error:', syncErr.message);
        }

        const savedMsg = await db.addMessage(from, text, timestamp, 'received', 'received', whatsappId, mediaPath, mediaType, null, quotedMsg, metadata);

        // Track Response in Analytics
        try {
            await db.recordTemplateResponse(from);
            io.emit('analytics_update', { type: 'response', number: from });
        } catch (resErr) {
            console.error('[Hub] Analytics Response Error:', resErr);
        }

        io.emit('new_message', {
            id: savedMsg.id,
            number: from,
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
            const aiStatus = await db.getCustomerAIStatus(from);

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
                    // Step 1: Fetch 5 messages of context
                    const history = await db.getConversationContext(from, 5);
                    
                    // Step 2: Build Enhanced Context
                    const contextStr = await vectorService.getUnifiedContext(text);

                    // Step 3: Generate Smart Reply
                    const aiResult = await aiService.generateAutoReply({
                        context: contextStr,
                        history: history,
                        userMessage: text,
                        businessName: profile.company_name
                    });

                    if (aiResult.reply) {
                        const cleanNumber = phoneFormatter.formatNumber(from);
                        const chatId = `${cleanNumber}@c.us`;

                        // Handle AI handovers (AI unsure)
                        if (aiResult.handover) {
                            await db.updateCustomerAIStatusByNumber(from, { handover_requested: 1 });
                            io.emit('handover_alert', { number: from, name: notifyName });
                        }

                        // Log the interaction for the Command Center
                        await db.logAIInteraction({
                            customer_number: from,
                            user_query: text,
                            ai_response: aiResult.reply,
                            context_used: contextStr,
                            confidence_score: aiResult.handover ? 0.5 : 0.95, // Estimated mapping
                            is_handover: aiResult.handover
                        });

                        io.emit('service_send_message', {
                            chatId,
                            text: aiResult.reply,
                            options: {},
                            to: cleanNumber,
                            contactName: notifyName
                        });
                        debugLog(`[AI Hook] Smart-Reply for ${cleanNumber}. Handover: ${aiResult.handover}`);
                    }
                }
            }
        } catch (err) {
            console.error('[AI Hook] Error during auto-reply generation:', err);
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
            // Removed redundant new_message emit to prevent UI duplication
        } else {
            console.error('Service send error:', error);
            debugLog(`[Server] Error callback. campaignId: ${originalData.campaignId}`);
            io.emit('message-error', { to, error });
            await db.addMessage(cleanNumber, text, timestamp, `error: ${error}`, 'sent', null, null, null, null, null, null, originalData.campaignId);
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
        await db.updateAIProduct(req.params.id, { ...req.body, manual_override: 1, embedding: null }); // nullify embedding so it regenerates
        io.emit('intelligent_products_changed');
        res.json({ success: true });
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

app.get('/api/ai-brain/knowledge', async (req, res) => {
    try { res.json({ success: true, documents: await db.getKnowledgeDocuments() }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ai-brain/knowledge', async (req, res) => {
    try {
        const { title, content, type } = req.body;
        const result = await db.addKnowledgeDocument(title, content, type);
        res.json({ success: true, id: result.id });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/ai-brain/knowledge/:id', async (req, res) => {
    try {
        const { title, content, type } = req.body;
        await db.updateKnowledgeDocument(req.params.id, title, content, type, null);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/ai-brain/knowledge/:id', async (req, res) => {
    try {
        await db.deleteKnowledgeDocument(req.params.id);
        res.json({ success: true });
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

// --- Database APIs (No changes needed) ---
app.get('/customers', async (req, res) => { try { res.json(await db.getCustomers()); } catch (e) { res.status(500).json({ error: e.message }); } });
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

// --- AI Template Generation ---
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
        console.log(`[Server] 🔍 Checking port ${port} availability...`);
        // Find PID holding the port
        const findCmd = `netstat -ano | findstr :${port} | findstr LISTENING`;
        const output = execSync(findCmd, { encoding: 'utf8' }).trim();
        
        if (output) {
            // Extract PID (last column)
            const lines = output.split('\n');
            const pids = new Set();
            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && pid !== '0') pids.add(pid);
            });

            for (const pid of pids) {
                console.log(`[Server] ⚠️ Port ${port} is held by PID ${pid}. Attempting cleanup...`);
                // Force kill if it's a node/chrome process associated with our app
                const killCmd = `powershell -Command "Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue"`;
                execSync(killCmd, { stdio: 'ignore' });
            }
            
            // Wait for OS to release the socket
            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (e) {
        // execSync throws if findstr finds nothing, which is good
    }
};

if (process.env.NODE_ENV !== 'test') {
    const startServer = async () => {
        try {
            await ensurePortAvailable(PORT);
            
            server.listen(PORT, async () => {
                console.log(`API Server running on port ${PORT}`);
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
                        const dbRef = require('./db'); // Ensure direct ref
                        const assets = await dbRef.dbAll(`SELECT * FROM media_assets WHERE is_protected = 0`);
                        const now = Date.now();
                        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 Days

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
                                // Cleanup DB if file missing
                                await dbRef.dbRun(`DELETE FROM media_assets WHERE hash = ?`, [asset.hash]);
                            }
                        }
                    } catch (err) {
                        console.error('[SIS] Cleanup Error:', err);
                    }
                });
            });

            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.error(`[Server] 🚨 Port ${PORT} is still in use after cleanup attempt.`);
                    process.exit(1); 
                }
            });

        } catch (err) {
            console.error('[Server] Failed to start:', err);
            process.exit(1);
        }
    };

    startServer();
}

module.exports = app;
