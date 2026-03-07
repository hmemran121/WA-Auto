const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { io } = require('socket.io-client');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

// Configure ffmpeg and ffprobe with absolute paths to node_modules
const ffmpegBinary = path.join(__dirname, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const ffprobeBinary = path.join(__dirname, 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe');

// Fallback to auto-detected if absolute path doesn't exist (safety check)
const finalFfmpegPath = fs.existsSync(ffmpegBinary) ? ffmpegBinary : ffmpegPath;
const finalFfprobePath = fs.existsSync(ffprobeBinary) ? ffprobeBinary : (ffprobePath || 'ffprobe');

console.log('[WA-PRO] FFmpeg Path:', finalFfmpegPath);
console.log('[WA-PRO] FFprobe Path:', finalFfprobePath);

const phoneFormatter = require('./utils/phoneFormatter');

ffmpeg.setFfmpegPath(finalFfmpegPath);
ffmpeg.setFfprobePath(finalFfprobePath);

const socket = io('http://localhost:3001');

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "wa-auto-client",
        dataPath: "./.wwebjs_auth"
    }),
    authTimeoutMs: 60000,
    qrMaxRetries: 5,
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1012170943-alpha.html',
    },
    puppeteer: {
        headless: true,
        handleSIGINT: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions',
            '--shm-size=1gb'
        ]
    }
});

let lastState = { state: 'initial', data: null };

const updateState = (state, data = null) => {
    lastState = { state, data };
    socket.emit('service_status_update', lastState);
};

// Audio conversion utility (WEBM -> OGG Opus)
const convertAudioToOgg = (inputPath) => {
    return new Promise((resolve, reject) => {
        // Double ensure paths are set
        ffmpeg.setFfmpegPath(ffmpegPath);
        ffmpeg.setFfprobePath(ffprobePath);

        const outputPath = inputPath.replace(/\.[^/.]+$/, "") + ".ogg";
        console.log(`[WA-PRO] Converting ${path.basename(inputPath)} to OGG...`);

        ffmpeg(inputPath)
            .setFfmpegPath(ffmpegPath) // Instance-level path set for Windows robustness
            .toFormat('ogg')
            .audioCodec('libopus')
            .audioChannels(1)
            .on('end', () => {
                console.log('[WA-PRO] Audio Conversion SUCCESS');
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('[WA-PRO] Audio Conversion ERROR:', err.message);
                reject(err);
            })
            .save(outputPath);
    });
};

socket.on('connect', () => {
    console.log('[WA-Service] Connected to API Hub');
    socket.emit('service_status_update', lastState);
});

socket.on('disconnect', () => {
    console.log('[WA-Service] Disconnected from API Hub. Reconnecting...');
});

console.log('[WA-Service] Starting WhatsApp Service...');

client.on('qr', async (qr) => {
    console.log('[WA-Service] QR Received');
    try {
        const url = await qrcode.toDataURL(qr);
        updateState('qr', url);
    } catch (err) {
        console.error('[WA-Service] QR Error:', err);
    }
});

client.on('ready', () => {
    console.log('[WA-Service] READY');
    updateState('ready');
});

client.on('authenticated', () => {
    console.log('[WA-Service] AUTHENTICATED');
    updateState('authenticated');
});

client.on('auth_failure', (msg) => {
    console.error('[WA-Service] AUTH FAILURE', msg);
    updateState('auth_failure', msg);
});

client.on('message', async (msg) => {
    console.log('[WA-Service] Message received');
    const from = msg.from.replace('@c.us', '');
    const text = msg.body;
    let mediaData = null;
    let quotedMsgBody = null;

    if (msg.hasMedia) {
        try {
            const media = await msg.downloadMedia();
            if (media) {
                mediaData = {
                    mimetype: media.mimetype,
                    data: media.data,
                    filename: `${Date.now()}-${msg.id.id}.${media.mimetype.split('/')[1]}`
                };
            }
        } catch (err) {
            console.error('[WA-Service] Media download error:', err);
        }
    }

    let metadata = null;
    if (msg.type === 'vcard') {
        const vcf = msg.body;
        const nameMatch = vcf.match(/FN(?:;.*)?:(.*)/);
        const telMatch = vcf.match(/waid=(\d+)/);
        metadata = JSON.stringify({
            name: nameMatch ? nameMatch[1].trim() : 'Contact',
            phone: telMatch ? telMatch[1].trim() : ''
        });
    } else if (msg.type === 'location') {
        metadata = JSON.stringify({
            lat: msg.location.latitude,
            lng: msg.location.longitude,
            name: msg.body || 'Location'
        });
    }

    let quotedMsgId = null;

    if (msg.hasQuotedMsg) {
        try {
            const quotedMsg = await msg.getQuotedMessage();
            quotedMsgBody = quotedMsg.body;
            quotedMsgId = quotedMsg.id._serialized;
        } catch (qErr) {
            console.error('[WA-Service] Quoted message fetch error:', qErr);
        }
    }

    socket.emit('service_new_message', {
        from,
        text,
        whatsappId: msg.id._serialized,
        media: mediaData,
        notifyName: msg._data.notifyName,
        quotedMsg: quotedMsgBody,
        quotedMsgId: quotedMsgId,
        metadata: metadata
    });
});

/* Button/Carousel response handler removed */

client.on('message_reaction', async (reaction) => {
    console.log('[WA-Service] Message reaction received');
    socket.emit('service_message_reaction', {
        whatsappId: reaction.msgId._serialized,
        reaction: reaction.reaction,
        senderId: reaction.senderId
    });
});

client.on('message_ack', (msg, ack) => {
    socket.emit('service_message_ack', {
        whatsappId: msg.id._serialized,
        ack
    });
});

client.on('disconnected', (reason) => {
    console.log('[WA-Service] Disconnected:', reason);
    updateState('initial');
});

// Helper to delete folder recursively (for session clearing)
const deleteFolderRecursive = (folderPath) => {
    if (fs.existsSync(folderPath)) {
        fs.readdirSync(folderPath).forEach((file) => {
            const curPath = path.join(folderPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(folderPath);
    }
};

socket.on('service_restart', async (data = {}) => {
    console.log('[WA-Service] Restarting client... Clear Session:', data.clearSession);
    updateState('initial');
    try {
        await client.destroy();
        console.log('[WA-Service] Client destroyed.');

        if (data.clearSession) {
            const sessionPath = path.join(__dirname, '.wwebjs_auth', 'session-wa-auto-client');
            console.log(`[WA-Service] Clearing session data at: ${sessionPath}`);
            try {
                deleteFolderRecursive(sessionPath);
                console.log('[WA-Service] Session data cleared successfully.');
            } catch (err) {
                console.error('[WA-Service] Error clearing session data:', err.message);
            }
        }
    } catch (e) {
        console.error('[WA-Service] Error during client destroy/restart:', e.message);
    }
    console.log('[WA-Service] Reinitializing client...');
    client.initialize().catch(err => console.error('[WA-Service] Init error:', err));
});

socket.on('service_send_message', async (data) => {
    if (lastState.state !== 'ready' && lastState.state !== 'authenticated') {
        console.warn('[WA-PRO] Cannot send message: Client is not ready yet. Current state:', lastState.state);
        socket.emit('service_message_result', {
            success: false,
            error: `WhatsApp client is not ready yet (Current state: ${lastState.state}). Please wait a moment for it to connect.`,
            originalData: data
        });
        return;
    }

    // If authenticated but not ready, log it but proceed (experimental tolerance)
    if (lastState.state === 'authenticated') {
        console.log('[WA-PRO] Proceeding with send in "authenticated" state (not yet "ready")...');
    }

    const processSpintax = (msgText) => {
        if (!msgText) return msgText;
        let processed = msgText;
        // Process nested spintax by repeatedly applying the regex until no more changes occur
        let lastProcessed;
        do {
            lastProcessed = processed;
            processed = processed.replace(/\{([^{}]+)\}/g, (match, contents) => {
                const spinOptions = contents.split('|');
                return spinOptions[Math.floor(Math.random() * spinOptions.length)];
            });
        } while (processed !== lastProcessed);

        return processed;
    };

    /**
     * Variable Mapper: Replaces {{name}}, {{phone}}, {{firstName}} etc.
     * with actual contact data.
     */
    const processVariables = (msgText, contactData) => {
        if (!msgText) return msgText;
        let processed = msgText;

        // Basic mappings
        const name = contactData.contactName || contactData.name || 'Customer';
        const firstName = name.split(' ')[0];
        const phone = contactData.to || contactData.number || '';
        const city = contactData.city || '';
        const companyName = contactData.companyName || '';
        const address = contactData.address || '';
        const email = contactData.email || '';
        const lastPurchase = contactData.lastPurchase || '';

        processed = processed.replace(/\{\{name\}\}/gi, name);
        processed = processed.replace(/\{\{firstName\}\}/gi, firstName);
        processed = processed.replace(/\{\{phone\}\}/gi, phone);
        processed = processed.replace(/\{\{city\}\}/gi, city);
        processed = processed.replace(/\{\{companyName\}\}/gi, companyName);
        processed = processed.replace(/\{\{address\}\}/gi, address);
        processed = processed.replace(/\{\{email\}\}/gi, email);
        processed = processed.replace(/\{\{lastPurchase\}\}/gi, lastPurchase);

        return processed;
    };

    let { chatId, text, options = {}, mediaPath, quotedMessageId, mediaType: incomingMediaType, attachments = [] } = data;

    // Process Spintax and Variables before sending
    text = processSpintax(text);
    text = processVariables(text, data);

    // Handle backward compatibility (single mediaPath -> attachments array)
    if (mediaPath && attachments.length === 0) {
        attachments.push({ url: mediaPath, type: incomingMediaType });
    }

    // Robust MIME detection FALLBACK
    const getMimeFromExt = (filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        const map = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.pdf': 'application/pdf',
            '.mp4': 'video/mp4',
            '.ogg': 'audio/ogg; codecs=opus',
            '.webm': 'audio/webm'
        };
        return map[ext] || 'application/octet-stream';
    };

    console.log(`[WA-PRO] SEND ATTEMPT: ${chatId} | Attachments: ${attachments.length} | Quote: ${quotedMessageId}`);

    let tempFiles = [];

    const sendOptions = { ...options };
    if (quotedMessageId) {
        sendOptions.quotedMessageId = quotedMessageId;
    }

    try {
        let anySent = false;
        let textConsumed = false;

        if (attachments.length > 0) {
            // Loop through each attachment
            for (let i = 0; i < attachments.length; i++) {
                const attach = attachments[i];
                let mediaObject;
                let isOgg = false; // Lifted scope
                let finalCaption = null;
                let finalMediaType = null;
                const currentSendOptions = { ...options };
                if (quotedMessageId) currentSendOptions.quotedMessageId = quotedMessageId;

                if (attach.type === 'location') {
                    console.log(`[WA-PRO] Location Attachment detected: ${attach.name} (Lat: ${attach.lat}, Lng: ${attach.lng})`);
                    const { Location } = require('whatsapp-web.js');
                    // Use Number() to retain maximum precision provided by the frontend instead of parseFloat
                    mediaObject = new Location(Number(attach.lat) || 0, Number(attach.lng) || 0, attach.name || 'Shared Location');
                    finalMediaType = 'location';

                    // Note: Locations do not support native captions in WA. Text will be sent separately.
                    // Do NOT set textConsumed = true here so it triggers the standalone text block.
                } else if (attach.type === 'vcard') {
                    const vName = attach.name || 'Unknown Contact';
                    const vPhone = attach.phone ? String(attach.phone).replace(/\D/g, '') : '';

                    console.log(`[WA-PRO] VCard Attachment detected: ${vName} (${vPhone})`);

                    if (!vPhone) {
                        console.warn(`[WA-PRO] VCard skipped: No valid phone number for ${vName}`);
                        continue;
                    }

                    mediaObject = `BEGIN:VCARD\nVERSION:3.0\nFN:${vName}\nTEL;type=CELL;type=VOICE;waid=${vPhone}:+${vPhone}\nEND:VCARD`;
                    currentSendOptions.parseVCards = true;
                    finalMediaType = 'vcard';
                } else {
                    // Robust path resolution: support absolute paths, relative paths, and local server URLs
                    let effectiveUrl = attach.url;
                    let fullPath = '';

                    if (effectiveUrl.startsWith('http')) {
                        try {
                            const urlObj = new URL(effectiveUrl);
                            // If it's on localhost, we treat it as a local file
                            if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
                                const uploadsIdx = urlObj.pathname.indexOf('/uploads/');
                                if (uploadsIdx !== -1) {
                                    // Extract everything from 'uploads/' onwards
                                    const relativePath = urlObj.pathname.slice(uploadsIdx + 1); // remove leading slash
                                    fullPath = path.resolve(__dirname, relativePath);
                                }
                            }
                        } catch (e) {
                            console.warn(`[WA-PRO] Failed to parse attachment URL: ${effectiveUrl}`);
                        }
                    }

                    // Fallback to direct path joining if fullPath wasn't resolved from URL
                    if (!fullPath) {
                        if (effectiveUrl.startsWith('/uploads/')) {
                            fullPath = path.resolve(__dirname, effectiveUrl.slice(1));
                        } else if (path.isAbsolute(effectiveUrl) && effectiveUrl.match(/^[a-zA-Z]:\\/)) {
                            fullPath = effectiveUrl;
                        } else {
                            const sanitizedUrl = effectiveUrl.startsWith('/') ? effectiveUrl.slice(1) : effectiveUrl;
                            fullPath = path.resolve(__dirname, sanitizedUrl);
                        }
                    }

                    if (!fs.existsSync(fullPath)) {
                        require('fs').appendFileSync(require('path').join(__dirname, 'debug.log'), `\n[WA-PRO] File not found: ${fullPath}\n`);
                        console.warn(`[WA-PRO] File not found: ${fullPath}, Skipping attachment.`);
                        continue;
                    }

                    // DYNAMIC FIX: Auto-detect if this is a voice note from filename or type
                    const isVoiceFile = attach.url.includes('voice-note') || attach.url.includes('voice-template') || (attach.type && attach.type.includes('audio'));
                    if (isVoiceFile && options.sendAudioAsVoice === undefined) {
                        options.sendAudioAsVoice = true;
                        currentSendOptions.sendAudioAsVoice = true;
                    }

                    // If it's a voice note, convert to OGG Opus for native PTT support
                    if (options.sendAudioAsVoice) {
                        console.log(`[WA-PRO] Voice Note detected. Starting conversion for: ${path.basename(fullPath)}`);
                        try {
                            const convertedPath = await convertAudioToOgg(fullPath);
                            fullPath = convertedPath;
                            tempFiles.push(convertedPath);
                            console.log('[WA-PRO] Audio conversion SUCCESS. Using OGG for PTT.');
                        } catch (convErr) {
                            console.warn('[WA-PRO] Audio conversion FAILED. Falling back to original file:', convErr.message);
                        }
                    }

                    // Create media object
                    const mediaData = fs.readFileSync(fullPath);
                    const base64Data = mediaData.toString('base64');
                    isOgg = fullPath.endsWith('.ogg');
                    const mimetype = isOgg ? 'audio/ogg; codecs=opus' : (attach.type || getMimeFromExt(attach.url) || 'application/octet-stream');

                    mediaObject = new MessageMedia(mimetype, base64Data, path.basename(fullPath));
                    finalMediaType = mimetype;

                    // Only attach text as caption to the first attachment (if it's not a PTT) OR use specific attachment caption
                    if (attach.caption) {
                        finalCaption = attach.caption;
                    } else if (i === 0 && text && !options.sendAudioAsVoice) {
                        // Only consume primary text as FIRST attachment's caption if NOT a voice note
                        finalCaption = text;
                        textConsumed = true;
                    }
                }

                // Let native caption check proceed (Locations will have finalCaption = null)

                // Native caption support check for non-PTT media
                if (finalCaption && !options.sendAudioAsVoice) {
                    currentSendOptions.caption = finalCaption;
                } else {
                    delete currentSendOptions.caption;
                }

                let sentMsg = null;

                // 1. Primary send attempt (PTT)
                try {
                    if (currentSendOptions.sendAudioAsVoice) {
                        delete currentSendOptions.caption;
                        if (!isOgg) {
                            console.warn('[WA-PRO] Warning: Sending as voice note without OGG conversion. This may fail.');
                        }
                    }

                    console.log(`[WA-PRO] Step 1: Sending Attachment ${i + 1}/${attachments.length} (${mediaObject.mimetype || attach.type})...`);
                    sentMsg = await client.sendMessage(chatId, mediaObject, currentSendOptions);
                    console.log(`[WA-PRO] Step 1 SUCCESS for Attachment ${i + 1}`);
                } catch (err1) {
                    const errStr = err1.stack || err1.message || err1.toString();
                    require('fs').appendFileSync(require('path').join(__dirname, 'debug.log'), `\n[WA-PRO] ERROR Step 1: ${errStr}\n`);
                    console.warn(`[WA-PRO] Step 1 FAILED for Attachment ${i + 1}:`, err1.message);

                    // 2. Fallback attempt without PTT options
                    try {
                        console.log(`[WA-PRO] Step 2: Plain media fallback for Attachment ${i + 1}...`);
                        await new Promise(r => setTimeout(r, 1000));
                        sentMsg = await client.sendMessage(chatId, mediaObject, currentSendOptions);
                        console.log(`[WA-PRO] Step 2 SUCCESS for Attachment ${i + 1}`);
                    } catch (err2) {
                        console.warn(`[WA-PRO] Step 2 FAILED for Attachment ${i + 1}:`, err2.message);

                        // 3. Final fallback as document
                        console.log(`[WA-PRO] Step 3: Document fallback for Attachment ${i + 1}...`);
                        await new Promise(r => setTimeout(r, 1000));
                        sentMsg = await client.sendMessage(chatId, mediaObject, { ...currentSendOptions, sendMediaAsDocument: true });
                        console.log(`[WA-PRO] Step 3 SUCCESS for Attachment ${i + 1}`);
                    }
                }

                if (sentMsg) {
                    anySent = true;
                    let notifyName = null;
                    try {
                        const contact = await sentMsg.getContact();
                        notifyName = contact.pushname || contact.name;
                    } catch (cErr) { }

                    // We clone original data and adapt it so the backend saves it as an isolated message
                    const msgSpecificData = { ...data, ...attach };
                    msgSpecificData.mediaUrl = attach.url;
                    msgSpecificData.mediaType = finalMediaType;
                    msgSpecificData.text = options.sendAudioAsVoice ? null : (finalCaption || null); // Don't save caption to audio bubble if PTT
                    msgSpecificData.attachments = []; // Clear attachments so frontend DB only creates one bubble per iteration

                    // Only emit success for the FIRST attachment or if we want every attachment logged separately.
                    // Let's emit for each to ensure full delivery confirmation.
                    socket.emit('service_message_result', {
                        success: true,
                        whatsappId: sentMsg.id._serialized,
                        notifyName,
                        originalData: msgSpecificData
                    });
                    console.log(`[WA-PRO] Attachment ${i + 1}/${attachments.length} SENT SUCCESSFULLY. ID: ${sentMsg.id._serialized}`);

                    // Handle captions for voice notes (send as follow-up message since PTT doesn't support native captions)
                    if (options.sendAudioAsVoice && finalCaption) {
                        console.log(`[WA-PRO] Sending follow-up caption for voice note...`);
                        await new Promise(r => setTimeout(r, 500));
                        try {
                            const captionMsg = await client.sendMessage(chatId, finalCaption, sendOptions);
                            socket.emit('service_message_result', {
                                success: true,
                                whatsappId: captionMsg.id._serialized,
                                notifyName,
                                originalData: { ...data, mediaUrl: null, mediaType: null, text: finalCaption, attachments: [] }
                            });
                        } catch (capErr) {
                            console.error('[WA-PRO] Failed to send follow-up caption:', capErr.message);
                        }
                    }
                }

                // Add a small delay between multiple attachments to prevent rate limits
                if (i < attachments.length - 1) {
                    await new Promise(r => setTimeout(r, 800));
                }
            } // end loop

            // If NO valid attachments were successfully sent, OR if the main text wasn't consumed as a caption, send it standalone
            if ((!anySent && text) || (text && !textConsumed)) {
                console.log(`[WA-PRO] Sending standalone text (Attachments sent: ${anySent}, consumed: ${textConsumed})`);
                const textMsg = await client.sendMessage(chatId, text, sendOptions);
                let notifyName = null;
                try {
                    const contact = await textMsg.getContact();
                    notifyName = contact.pushname || contact.name;
                } catch (cErr) { }
                socket.emit('service_message_result', {
                    success: true,
                    whatsappId: textMsg.id._serialized,
                    notifyName,
                    originalData: { ...data, mediaUrl: null, mediaType: null, attachments: [] }
                });
            }

            // Scheduler ACK - Emit ONCE after the entire batch (attachments + text) is done
            if (data.schedulerTracked && data.reqId) {
                socket.emit('scheduler_msg_sent', { reqId: data.reqId });
            }

        } else {
            // No attachments, just send text
            console.log(`[WA-PRO] Sending text only...`);
            const textMsg = await client.sendMessage(chatId, text, sendOptions);
            let notifyName = null;
            try {
                const contact = await textMsg.getContact();
                notifyName = contact.pushname || contact.name;
            } catch (cErr) { }
            socket.emit('service_message_result', {
                success: true,
                whatsappId: textMsg.id._serialized,
                notifyName,
                originalData: { ...data, attachments: [] }
            });
            // Scheduler ACK
            if (data.schedulerTracked && data.reqId) {
                socket.emit('scheduler_msg_sent', { reqId: data.reqId });
            }
            console.log(`[WA-PRO] TEXT MESSAGE SENT SUCCESSFULLY. Contact: ${notifyName}`);
        }

    } catch (err) {

        console.error('[WA-PRO] FATAL SEND ERROR:', err.message);

        // DYNAMIC RECOVERY: If frame is detached, the browser session is dead.
        if (err.message.includes('detached Frame')) {
            console.error('[WA-PRO] ⚠️ CRITICAL: Detached Frame detected. Client session is unstable.');
            updateState('initial');
            socket.emit('service_status_update', { state: 'initial', error: 'Browser Frame Detached - Please Restart' });
        }

        socket.emit('service_message_result', {
            success: false,
            error: err.message,
            originalData: data
        });
        // Scheduler ACK for error
        if (data.schedulerTracked && data.reqId) {
            socket.emit('scheduler_msg_error', { reqId: data.reqId, error: err.message });
        }
    } finally {
        // Cleanup temp files
        tempFiles.forEach(file => {
            try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (e) { }
        });
    }
});

socket.on('service_send_reaction', async (data) => {
    const { messageId, reaction } = data;
    try {
        const msg = await client.getMessageById(messageId);
        if (msg) {
            await msg.react(reaction);
            socket.emit('service_reaction_result', { success: true, messageId, reaction });
        }
    } catch (err) {
        console.error('[WA-PRO] REACTION ERROR:', err.message);

        if (err.message.includes('detached Frame')) {
            console.error('[WA-PRO] ⚠️ CRITICAL: Detached Frame detected during reaction.');
            updateState('initial');
        }

        socket.emit('service_reaction_result', { success: false, error: err.message, messageId });
    }
});



socket.on('service_sync_contacts', async (data = {}) => {
    if (lastState.state !== 'ready') {
        console.warn('[WA-Service] Sync rejected: Client not ready');
        return;
    }
    const mode = data.mode || 'all';
    const groupId = data.groupId; // Capture groupId
    console.log(`[WA-Service] Starting ${mode} contact sync...`);
    try {
        let contacts;
        if (mode === 'chats') {
            const chats = await client.getChats();
            // Filter out groups and retrieve contacts for each chat
            const chatContacts = await Promise.all(chats.map(async chat => {
                if (chat.isGroup) return null;
                try {
                    return await chat.getContact();
                } catch (err) {
                    return null;
                }
            }));
            contacts = chatContacts.filter(c => c !== null);
        } else {
            contacts = await client.getContacts();
        }

        const validContacts = contacts.filter(c => (c.isMyContact || c.name || c.pushname || c.id?.user) && !c.isGroup && (c.number || c.id?.user));

        // --- HYBRID INTELLIGENT DEDUPLICATION ---
        const contactGroups = new Map(); // Name -> Array of Contacts

        for (const c of validContacts) {
            const rawNumber = c.number || c.id?.user;
            const normalized = phoneFormatter.formatNumber(rawNumber);
            const name = c.name || c.pushname || normalized;

            if (!contactGroups.has(name)) contactGroups.set(name, []);
            contactGroups.get(name).push({
                ...c,
                normalized,
                isValid: phoneFormatter.isValidPhoneNumber(rawNumber)
            });
        }

        const uniqueContacts = new Map(); // Normalized Number -> Contact

        for (const [name, group] of contactGroups.entries()) {
            // Find valid numbers in this group
            const validOnes = group.filter(c => c.isValid);

            if (validOnes.length > 0) {
                // If we have valid numbers, ONLY keep them and ignore all invalid ones (LIDs)
                validOnes.forEach(v => {
                    uniqueContacts.set(v.normalized, v);
                });
            } else {
                // If NO valid numbers, keep the most likely one (usually the shortest/original number)
                const best = group.sort((a, b) => a.normalized.length - b.normalized.length)[0];
                if (best) {
                    // Filter out obvious timestamps/LIDs even if they are the only option
                    // (LIDs often start with 1 and are >= 13 digits)
                    if (!(best.normalized.length >= 13 && best.normalized.startsWith('1'))) {
                        uniqueContacts.set(best.normalized, best);
                    } else {
                        console.log(`[WA-Service] Discarding orphan LID: ${name} (${best.normalized})`);
                    }
                }
            }
        }

        const filteredList = Array.from(uniqueContacts.values());
        socket.emit('process_start', { title: 'Contact Synchronization', total: filteredList.length * 2 }); // Double total for Fetching + Saving phases

        const mapped = [];
        for (let i = 0; i < filteredList.length; i++) {
            const c = filteredList[i];
            const normalized = phoneFormatter.formatNumber(c.number || c.id?.user);
            const displayName = c.name || c.pushname || normalized;

            mapped.push({
                name: displayName,
                number: normalized
            });

            // Emit progress for every unique contact (Fetching Phase: 1 to N)
            socket.emit('process_update', {
                message: `Fetching: ${displayName} 🔍`,
                type: 'info',
                current: i + 1
            });
        }

        socket.emit('service_contacts_sync_result', { success: true, contacts: mapped, groupId }); // Pass groupId back
        // process_end removed here, Hub will emit it after DB sync
    } catch (err) {
        console.error('[WA-Service] Contact sync error:', err);
        socket.emit('service_contacts_sync_result', { success: false, error: err.message });
        socket.emit('process_end', { status: 'failed', message: `Sync failed: ${err.message}` });
    }
});

socket.on('service_fetch_more_history', async (data) => {
    // Dynamic Solution: If authenticated but not ready, wait a bit
    if (lastState.state === 'authenticated') {
        console.log('[WA-Service] History request received while authenticating. Waiting for READY...');
        let waitAttempts = 0;
        while (lastState.state !== 'ready' && waitAttempts < 10) {
            await new Promise(r => setTimeout(r, 500));
            waitAttempts++;
        }
    }

    if (lastState.state !== 'ready') {
        console.warn('[WA-Service] History fetch rejected: Client not ready (State: ' + lastState.state + ')');
        return;
    }
    const { chatId, lastMsgId, limit = 30 } = data;
    console.log(`[WA-Service] Fetching ${limit} messages for ${chatId}${lastMsgId ? ' before ' + lastMsgId : ' (latest)'}`);

    try {
        const finalChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
        const chat = await client.getChatById(finalChatId);
        // If no lastMsgId, fetch the latest messages without a 'before' filter
        const fetchOptions = lastMsgId ? { limit, before: lastMsgId } : { limit };
        const messages = await chat.fetchMessages(fetchOptions);

        const mappedMessages = [];
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            let mediaData = null;
            if (msg.hasMedia) {
                try {
                    const media = await msg.downloadMedia();
                    if (media) {
                        mediaData = {
                            mimetype: media.mimetype,
                            data: media.data,
                            filename: `${Date.now()}-${msg.id.id}.${media.mimetype.split('/')[1]}`
                        };
                    }
                } catch (e) { }
            }

            mappedMessages.push({
                whatsappId: msg.id._serialized,
                from: msg.from.replace('@c.us', ''),
                to: msg.to.replace('@c.us', ''),
                text: msg.body,
                timestamp: msg.timestamp,
                type: msg.fromMe ? 'sent' : 'received',
                media: mediaData,
                ack: msg.ack
            });
        }

        socket.emit('service_history_result', {
            success: true,
            chatId,
            messages: mappedMessages
        });
    } catch (err) {
        console.error('[WA-Service] History fetch error:', err);
        socket.emit('service_history_result', { success: false, error: err.message, chatId });
    }
});

socket.on('service_check_registration', async (data) => {
    if (lastState.state !== 'ready') return;
    try {
        const registered = await client.isRegisteredUser(data.chatId);
        socket.emit('service_registration_result', { chatId: data.chatId, registered });
    } catch (err) {
        socket.emit('service_registration_result', { chatId: data.chatId, registered: false });
    }
});

socket.on('service_delete_message', async (data) => {
    if (lastState.state !== 'ready') return;
    const { whatsappId } = data;
    console.log(`[WA-Service] Request to delete message: ${whatsappId}`);

    try {
        // Attempt to fetch the message by its ID
        const msg = await client.getMessageById(whatsappId);
        if (msg) {
            // true = Delete for everyone
            await msg.delete(true);
            console.log(`[WA-Service] Message deleted successfully: ${whatsappId}`);
            socket.emit('service_delete_result', { success: true, whatsappId });
        } else {
            console.warn(`[WA-Service] Message not found for deletion: ${whatsappId}`);
            socket.emit('service_delete_result', { success: false, error: 'Message not found', whatsappId });
        }
    } catch (err) {
        console.error(`[WA-Service] Error deleting message ${whatsappId}:`, err.message);
        socket.emit('service_delete_result', { success: false, error: err.message, whatsappId });
    }
});

client.initialize().catch(err => console.error('[WA-Service] Init error:', err));
