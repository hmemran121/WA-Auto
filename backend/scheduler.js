/**
 * scheduler.js — Scheduled Campaign Engine
 * Runs every minute via node-cron, checks for due campaigns and fires them
 * through the existing Socket.io → WhatsApp Service pipeline.
 */

'use strict';

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const phoneFormatter = require('./utils/phoneFormatter');
const schedulerBus = require('./schedulerBus');
const { getWindowStatus } = require('./utils/windowHelper');

const debugLog = (msg) => {
    if (process.env.DEBUG === 'true') console.log(msg);
};

const SANE_DEFAULTS = {
    DELAY_MIN: 15000,
    DELAY_MAX: 25000,
    BATCH_MIN: 30,
    BATCH_MAX: 50,
    BREAK_MIN: 120000,
    BREAK_MAX: 300000
};


// ── In-memory pause/cancel state for running campaigns ─────────────────────
const campaignState = new Map(); // campaignId → { paused: boolean, cancelled: boolean, delayMinMs: number, delayMaxMs: number, consecutiveFailCount: number }

function setCampaignPaused(id, isPaused) {
    const stringId = String(id);
    const current = campaignState.get(stringId) || { paused: false, cancelled: false, consecutiveFailCount: 0 };
    if (current.paused === isPaused) return; // Prevent redundant logging
    campaignState.set(stringId, { ...current, paused: isPaused });
    console.log(`[Scheduler] Campaign #${stringId} ${isPaused ? 'paused' : 'resumed'} in-memory.`);
}

async function setCampaignCancelled(id, db = null) {
    const stringId = String(id);
    const current = campaignState.get(stringId) || { paused: false, cancelled: false, consecutiveFailCount: 0 };
    campaignState.set(stringId, { ...current, cancelled: true });
    console.log(`[Scheduler] Campaign #${stringId} cancelled in-memory.`);

    // Persist to DB if possible (to make it permanent in Queue/History)
    if (db) {
        try {
            if (typeof db.cancelScheduledCampaign === 'function') {
                await db.cancelScheduledCampaign(id);
            }
            if (typeof db.removeActiveExecution === 'function') {
                await db.removeActiveExecution(id);
            }
        } catch (err) {
            console.error(`[Scheduler] Failed to persist cancellation for #${id}:`, err.message);
        }
    }
}

function updateCampaignDelay(id, delayMinMs, delayMaxMs) {
    const stringId = String(id);
    const current = campaignState.get(stringId) || { paused: false, cancelled: false, consecutiveFailCount: 0 };
    const min = Number(delayMinMs);
    const max = Number(delayMaxMs);
    console.log(`[Scheduler] Adjusting delays for #${stringId}: ${min}-${max}ms`);
    campaignState.set(stringId, { ...current, delayMinMs: min, delayMaxMs: max });
}

function isCampaignPaused(id) {
    return campaignState.get(String(id))?.paused === true;
}

function updateScheduledContent(id, text) {
    const stringId = String(id);
    const current = campaignState.get(stringId) || { paused: false, cancelled: false, consecutiveFailCount: 0 };
    campaignState.set(stringId, { ...current, textOverride: text });
    console.log(`[Scheduler] Live content update applied for campaign #${stringId}`);
}

function isCampaignCancelled(id) {
    return campaignState.get(String(id))?.cancelled === true;
}

function clearCampaignState(id) {
    campaignState.delete(String(id));
}

/**
 * Interruptible delay that checks for cancellation every 500ms
 */
async function interruptibleHumanDelay(campaignId, minMs, maxMs, io, currentCount) {
    const totalDelay = minMs + Math.random() * (maxMs - minMs);
    const start = Date.now();
    let waitOffset = 0;
    let wasPaused = false;

    // Use a smaller heartbeat for tests
    const heartbeat = (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) ? 10 : 500;

    let logSentForPause = false;
    let logSentForResume = false;

    while (Date.now() - (start + waitOffset) < totalDelay) {
        if (isCampaignCancelled(campaignId)) return;
        if (isCampaignPaused(campaignId)) {
            wasPaused = true;
            logSentForResume = false; // Reset resume flag
            await new Promise(r => setTimeout(r, heartbeat));
            waitOffset += heartbeat;

            // Sync UI countdown and show PAUSED state
            if (io) {
                const remaining = Math.max(0, totalDelay - (Date.now() - (start + waitOffset)));
                const payload = {
                    id: String(campaignId),
                    campaignId: campaignId,
                    statusDetail: 'paused',
                    current: currentCount,
                    antiBan: {
                        jitter: {
                            current: (remaining / 1000).toFixed(1),
                            expiresAt: Date.now() + remaining
                        }
                    }
                };

                // Only add message once per pause state
                if (!logSentForPause) {
                    payload.message = '⏸ Human Jitter Paused. Waiting for resume...';
                    payload.type = 'info';
                    logSentForPause = true;
                }

                io.emit('process_update', payload);
            }
            continue;
        } else if (wasPaused) {
            wasPaused = false;
            logSentForPause = false; // Reset pause flag
            // Resync UI countdown immediately on unpause
            if (io) {
                const remaining = Math.max(0, totalDelay - (Date.now() - (start + waitOffset)));
                const payload = {
                    id: String(campaignId),
                    campaignId: campaignId,
                    statusDetail: 'jitter_wait',
                    current: currentCount,
                    antiBan: {
                        jitter: {
                            current: (remaining / 1000).toFixed(1),
                            expiresAt: Date.now() + remaining
                        }
                    }
                };

                if (!logSentForResume) {
                    payload.message = '▶ Jitter Resumed. Continuing...';
                    payload.type = 'info';
                    logSentForResume = true;
                }

                io.emit('process_update', payload);
            }
        }

        // Dynamic wait to avoid 10ms 100% CPU lockouts while retaining precision.
        const timeRemaining = totalDelay - (Date.now() - (start + waitOffset));
        const waitTime = Math.min(heartbeat, Math.max(10, timeRemaining));
        if (waitTime > 0) {
            await new Promise(r => setTimeout(r, waitTime));
        }
    }
}

/**
 * Wait while a campaign is paused. Resolves when unpaused or cancelled.
 */
async function waitIfPaused(campaignId, io, name) {
    while (isCampaignPaused(campaignId)) {
        if (isCampaignCancelled(campaignId)) return;
        await new Promise(r => setTimeout(r, 1000)); // Relaxed from 500ms to 1s to save DB calls and CPU
    }
}

/**
 * Send a single message and wait for real acknowledgment from the whatsapp-service
 * via the shared schedulerBus EventEmitter.
 * Returns { success: true } or { success: false, reason: string }.
 */
function sendWithAck(io, payload, timeoutMs = 30000) {
    return new Promise((resolve) => {
        const reqId = `sch_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            schedulerBus.removeListener('scheduler_msg_sent', onSent);
            schedulerBus.removeListener('scheduler_msg_error', onError);
            // Timeout — WA delivery is async, assume queued successfully
            resolve({ success: true });
        }, timeoutMs);

        function onSent(data) {
            if (data?.reqId !== reqId) return;
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            schedulerBus.removeListener('scheduler_msg_sent', onSent);
            schedulerBus.removeListener('scheduler_msg_error', onError);
            resolve({ success: true });
        }

        function onError(data) {
            if (data?.reqId !== reqId) return;
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            schedulerBus.removeListener('scheduler_msg_sent', onSent);
            schedulerBus.removeListener('scheduler_msg_error', onError);
            resolve({ success: false, reason: data.error || 'Send failed' });
        }

        schedulerBus.on('scheduler_msg_sent', onSent);
        schedulerBus.on('scheduler_msg_error', onError);

        debugLog(`[Scheduler] Emitting message. campaignId: ${payload.campaignId}`);
        io.emit('service_send_message', { ...payload, reqId, schedulerTracked: true });
    });
}

/**
 * runCampaign — Execute a single scheduled campaign
 */
async function runCampaign(io, campaign, db, deps = {}) {
    const sleep = deps.sleep || (ms => new Promise(r => setTimeout(r, ms)));
    const { id, name, message, target_type, target_id } = campaign;
    let startIndex = campaign.current_index || 0;
    let sentCount = campaign.sent_count || 0;
    let failCount = campaign.fail_count || 0;

    console.log(`[Scheduler] Starting campaign #${id}: ${name}`);

    // 🛡️ Pre-check Daily Quota
    const quota = await db.isDailyLimitReached();
    if (quota.reached) {
        console.warn(`[Scheduler] Quota Reached: ${quota.sent}/${quota.limit}. Skipping run for #${id}.`);
        io.emit('process_update', {
            id: String(id),
            source: 'scheduled_campaign',
            campaignId: id,
            message: `🚫 Daily Quota Reached (${quota.sent}/${quota.limit}). Scheduled run delayed.`,
            type: 'error'
        });
        return;
    }

    let windows = [];
    let offset = 0;
    let settings = {};
    let delayMinMs = SANE_DEFAULTS.DELAY_MIN;
    let delayMaxMs = SANE_DEFAULTS.DELAY_MAX;
    let respectWindows = true;

    try {
        settings = await db.getAllSettings();
        const globalMin = settings.scheduler_delay_min_ms;
        const globalMax = settings.scheduler_delay_max_ms;

        // Enterprise Unit Sanitization (seconds to ms helper)
        const sanitizeDelay = (val, fallback) => {
            const num = parseInt(val);
            if (isNaN(num) || num <= 0) return fallback;
            return num < 1000 ? num * 1000 : num;
        };

        const HARD_MIN_DELAY = 5000; // 5s absolute minimum for anti-ban safety
        delayMinMs = Math.max(HARD_MIN_DELAY, sanitizeDelay(campaign.delayMin || campaign.delay_min, globalMin));
        delayMaxMs = Math.max(delayMinMs + 1000, sanitizeDelay(campaign.delayMax || campaign.delay_max, globalMax));

        // Load Windows: prioritize campaign-specific, then global
        const campaignWindowsRaw = campaign.execution_windows || campaign.executionWindows;
        respectWindows = campaign.respect_execution_windows !== undefined ? !!campaign.respect_execution_windows : true;

        if (campaignWindowsRaw && campaignWindowsRaw !== '[]') {
            windows = typeof campaignWindowsRaw === 'string' ? JSON.parse(campaignWindowsRaw) : campaignWindowsRaw;
        } else {
            windows = JSON.parse(settings.execution_windows || '[]');
        }

        offset = parseInt(settings.timezone_offset || 0);
    } catch (e) {
        console.warn('[Scheduler] Could not load delay/window settings, using defaults.', e);
    }

    // Init campaign state
    const stringId = String(id);
    const current = campaignState.get(stringId) || { paused: false, cancelled: false, consecutiveFailCount: 0 };
    campaignState.set(stringId, { ...current, delayMinMs, delayMaxMs, consecutiveFailCount: 0 });

    if (isCampaignCancelled(stringId)) {
        console.log(`[Scheduler] Campaign #${stringId} was cancelled before run started. Cleanup.`);
        clearCampaignState(stringId);
        return;
    }

    console.log(`[Scheduler] Starting campaign #${id}: "${name}" | Delay: ${delayMinMs}-${delayMaxMs}ms`);

    // Mark as running immediately to prevent duplicate execution
    await db.updateScheduledCampaignStatus(id, 'running', 0, 0);
    io.emit('scheduled_campaign_update', { id, status: 'running' });
    io.emit('scheduled_campaigns_changed');

    // ── Resolve recipients ────────────────────────────────────────────────────
    let targets = [];

    if (campaign._recoveredTargets) {
        targets = campaign._recoveredTargets;
    } else if (target_type === 'contact') {
        try {
            const contacts = await db.getCustomers();
            const contact = contacts.find(c => String(c.id) === String(target_id));
            if (contact) targets = [{
                name: contact.name,
                phone: contact.number,
                city: contact.city,
                companyName: contact.company_name || contact.companyName,
                address: contact.address,
                email: contact.email,
                lastPurchase: contact.last_purchase || contact.lastPurchase
            }];
        } catch (err) {
            console.error(`[Scheduler] Failed to resolve contact:`, err.message);
        }
    } else if (target_type === 'group') {
        try {
            const members = await db.getContactsByGroup(target_id);
            targets = members.map(c => ({
                name: c.name,
                phone: c.number,
                city: c.city,
                companyName: c.company_name || c.companyName,
                address: c.address,
                email: c.email,
                lastPurchase: c.last_purchase || c.lastPurchase
            }));
        } catch (err) {
            console.error(`[Scheduler] Failed to resolve group:`, err.message);
        }
    }

    if (targets.length === 0) {
        console.warn(`[Scheduler] Campaign #${id} has no valid targets. Marking as failed.`);
        await db.updateScheduledCampaignStatus(id, 'failed', 0, 0, 0);
        io.emit('scheduled_campaign_update', { id, status: 'failed' });
        io.emit('scheduled_campaigns_changed');
        io.emit('process_end', {
            id: String(id),
            source: 'scheduled_campaign',
            campaignId: id,
            status: 'failed',
            sent: 0,
            failed: 0,
            message: `Campaign "${name}" failed: no valid recipients found.`,
        });
        clearCampaignState(id);
        return;
    }

    // Sync the resolved total_recipients back to DB so UI stats correctly use it
    await db.updateScheduledCampaignStatus(id, 'running', 0, 0, targets.length);

    // Emit process_start enriched with delay and anti-ban info
    io.emit('process_start', {
        id: String(id),
        source: 'scheduled_campaign',
        campaignId: id,
        title: `📅 Scheduled: ${name}`,
        total: targets.length,
        current: startIndex,
        text: message,
        antiBan: {
            quota: { sent: quota.sent, limit: quota.limit, enabled: true }, // settings check inside isDailyLimitReached
            batch: { enabled: true, batchSize: 50 }, // Placeholder values from local settings below
            jitter: { enabled: true, min: delayMinMs / 1000, max: delayMaxMs / 1000 },
            windows: { enabled: respectWindows }
        }
    });

    // --- Persistence: Save to active_executions table ---
    try {
        await db.saveActiveExecution({
            id: id,
            type: 'scheduled',
            current_index: 0,
            total_count: targets.length,
            status: 'running',
            target_data: targets,
            payload: {
                name,
                message,
                delayMinMs,
                delayMaxMs,
                execution_windows: campaign.execution_windows || campaign.executionWindows,
                respect_execution_windows: respectWindows ? 1 : 0
            }
        });
    } catch (e) {
        console.error(`[Scheduler] Failed to persist active execution for #${id}:`, e.message);
    }

    // Supports recovery/resume from a specific index if passed via _recoveredTargets or direct props
    if (campaign.startIndex !== undefined && campaign.startIndex !== null) {
        startIndex = parseInt(campaign.startIndex, 10) || 0;
        sentCount = campaign.sentCount || 0;
        failCount = campaign.failCount || 0;
        console.log(`[Scheduler] Resuming campaign #${id} from index ${startIndex}`);
    }

    // ── Duplicate Protection: Fetch already sent numbers but do not mutate targets array ──
    let sentNumbers = new Set();
    try {
        const alreadySentMessages = await db.getCampaignMessages(id);
        sentNumbers = new Set(alreadySentMessages.map(m => String(m.receiver_number || m.number)));
    } catch (e) {
        console.error(`[Scheduler] Failed to fetch existing messages for #${id}:`, e.message);
    }

    // ── Send loop ──────────────────────────────────────────────────────────────
    const campaignIdString = String(id);
    mainLoop: for (let i = startIndex; i < targets.length; i++) {
        // Check for cancellation first
        if (isCampaignCancelled(campaignIdString)) {
            console.log(`[Scheduler] Campaign #${id} was cancelled at item ${i + 1}.`);
            break;
        }

        // Dynamic Window & Policy Check Logic (Interruptible Heartbeat)
        const checkWindowAndWait = async () => {
            const currentSettings = await db.getAllSettings();
            const globalWindowsEnabled = currentSettings.enable_windows !== 'false';
            if (!globalWindowsEnabled || !respectWindows) return; // All clear

            // Determine which windows to use
            let currentWindows = windows;
            try {
                if (!(campaign.execution_windows || campaign.executionWindows)) {
                    currentWindows = JSON.parse(currentSettings.execution_windows || '[]');
                }
            } catch (e) {
                console.warn('[Scheduler] Window parse fail during wait:', e.message);
                currentWindows = [];
            }

            const offset = parseInt(currentSettings.timezone_offset || 0);
            let windowStatus = getWindowStatus(currentWindows, offset);

            if (!windowStatus.isOpen) {
                console.log(`[Scheduler] Campaign #${id} outside windows (Eval: ${windowStatus.currentEvaluationTime}). Waiting until ${windowStatus.nextOpeningAt}.`);
                setCampaignPaused(id, true);

                // Initial emission to set the UI countdown and log entry
                io.emit('process_update', {
                    id: String(id),
                    source: 'scheduled_campaign',
                    campaignId: id,
                    message: `⏸ Window Closed (Eval: ${windowStatus.currentEvaluationTime}). Resuming at ${windowStatus.nextOpeningAt}.`,
                    type: 'warning',
                    current: i,
                    statusDetail: 'window_wait',
                    resumeAt: Date.now() + windowStatus.msUntilOpen
                });

                while (!windowStatus.isOpen) {
                    // Check for cancellation or settings change inside wait loop
                    if (isCampaignCancelled(id)) return;

                    const refreshedSettings = await db.getAllSettings();
                    if (refreshedSettings.enable_windows === 'false') break; // Dynamically resumed

                    currentWindows = JSON.parse(refreshedSettings.execution_windows || '[]');
                    const currentOffset = parseInt(refreshedSettings.timezone_offset || 0);
                    windowStatus = getWindowStatus(currentWindows, currentOffset);

                    // Silence: No io.emit here unless resumeAt changes significantly

                    // Respond fast to "Stop": Poll every 3 seconds instead of 30s
                    // But don't overwhelm DB: sleep in 3s chunks
                    await sleep(3000);
                }

                setCampaignPaused(id, false);
                console.log(`[Scheduler] Campaign #${id} resumed from window wait.`);
                io.emit('process_update', {
                    id: String(id),
                    source: 'scheduled_campaign',
                    campaignId: id,
                    message: `🕒 Window Re-opened. Resuming...`,
                    type: 'info',
                    current: i,
                    statusDetail: 'running'
                });
            }
        };

        await checkWindowAndWait();
        if (isCampaignCancelled(id)) break;

        // Wait if paused (blocking but non-busy via 500ms poll)
        if (isCampaignPaused(id)) {
            io.emit('process_update', {
                id: String(id),
                campaignId: id,
                statusDetail: 'paused',
                message: '⏸ Campaign Paused. Waiting for resume...',
                type: 'warning',
                current: i
            });
            await waitIfPaused(id, io, name);
            if (isCampaignCancelled(id)) break;
            io.emit('process_update', {
                id: String(id),
                campaignId: id,
                statusDetail: 'active',
                message: '▶ Campaign Resumed. Continuing...',
                type: 'info',
                current: i
            });
        }

        const target = targets[i];
        if (!target) continue;

        const rawPhone = target.phone || target.number;
        if (!rawPhone) continue;

        const cleanPhone = phoneFormatter.formatNumber(rawPhone);

        // Skip if already sent to this exact number in this campaign
        if (sentNumbers.has(String(cleanPhone)) || sentNumbers.has(String(rawPhone))) {
            console.log(`[Scheduler] Skipping already sent number: ${cleanPhone}`);
            db.updateActiveExecutionProgress(id, i + 1, 'running').catch(() => { });
            continue;
        }

        const chatId = `${cleanPhone}@c.us`;
        const displayName = target.name || cleanPhone;

        // Apply Live Content Update if exists
        const currentText = campaignState.get(campaignIdString)?.textOverride || message;

        // Resolve variables and then Spintax
        const resolvedVarText = resolveVariables(currentText, target);
        const resolvedText = parseSpintax(resolvedVarText);

        const result = await sendWithAck(io, {
            chatId,
            text: resolvedText,
            to: cleanPhone,
            contactName: target.name,
            contactId: null,
            to: cleanPhone,
            city: target.city,
            companyName: target.companyName,
            address: target.address,
            email: target.email,
            lastPurchase: target.lastPurchase,
            mediaPath: campaign.media_path || null,
            mediaUrl: campaign.media_path || null,
            mediaType: campaign.media_type || null,
            attachments: campaign.attachments || [],
            templateId: campaign.template_id || null,
            campaignId: id
        });

        const state = campaignState.get(campaignIdString);

        if (result.success) {
            sentCount++;
            state.consecutiveFailCount = 0;
            io.emit('process_update', {
                id: String(id),
                source: 'scheduled_campaign',
                campaignId: id,
                message: `✅ Message sent to ${displayName || cleanPhone}`,
                contactName: displayName || cleanPhone || 'Unknown',
                phone: cleanPhone || 'Unknown',
                type: 'success',
                current: i + 1,
                statusDetail: 'active',
                antiBan: {
                    batchProgress: { current: state.sentSinceLastBreak || 0, total: state.nextBreakAt || 50 }
                }
            });

            // Update persistent progress
            db.updateActiveExecutionProgress(id, i + 1, 'running').catch(() => { });
        } else {
            failCount++;
            state.consecutiveFailCount = (state.consecutiveFailCount || 0) + 1;
            console.error(`[Scheduler] Send failed for ${cleanPhone}: ${result.reason}`);

            // ── Non-blocking Retry Logic (5 Minutes) ──
            const retryDelay = 5 * 60 * 1000; // 5 Minutes
            console.log(`[Scheduler] Scheduling retry for ${cleanPhone} in 5 minutes.`);

            io.emit('process_update', {
                id: String(id),
                source: 'scheduled_campaign',
                campaignId: id,
                message: `Retry scheduled for ${displayName} in 5m`,
                type: 'warning'
            });

            // For tests, we use the injectable sleep to background this or we just use setTimeout as before but safely
            setTimeout(async () => {
                console.log(`[Scheduler] Executing retry for ${cleanPhone}...`);
                const resolvedTextRetry = resolveVariables(message, target);
                const retryResult = await sendWithAck(io, {
                    chatId,
                    text: resolvedTextRetry,
                    to: cleanPhone,
                    contactName: target.name,
                    mediaPath: campaign.media_path || null,
                    mediaType: campaign.media_type || null,
                    attachments: campaign.attachments || [],
                    templateId: campaign.template_id || null,
                    campaignId: id,
                    isRetry: true
                });

                if (retryResult.success) {
                    console.log(`[Scheduler] Retry success for ${cleanPhone}`);
                    io.emit('process_update', {
                        id: String(id),
                        source: 'scheduled_campaign',
                        campaignId: id,
                        message: `✅ Retry Success: ${displayName}`,
                        type: 'info'
                    });
                } else {
                    console.error(`[Scheduler] Retry failed for ${cleanPhone}: ${retryResult.reason}`);
                }
            }, retryDelay);

            io.emit('process_update', {
                id: String(id),
                source: 'scheduled_campaign',
                campaignId: id,
                message: `❌ Failed to send to ${displayName || cleanPhone}: ${result.reason}`,
                contactName: displayName || cleanPhone || 'Unknown',
                phone: cleanPhone || 'Unknown',
                type: 'error',
                current: i + 1,
                statusDetail: 'active'
            });

            // Anti-ban intelligence: auto-pause on 3 consecutive failures
            if (state.consecutiveFailCount >= 3) {
                console.warn(`[Scheduler] Anti-ban triggered for #${id}: too many failures.`);
                state.paused = true;
                io.emit('execution_state_changed', { campaignId: id, state: 'paused' });
                io.emit('anti_ban_triggered', {
                    campaignId: id,
                    reason: 'পরপর বেশ কয়েকটি মেসেজ ফেইল হয়েছে। হোয়াটসঅ্যাপ একাউন্ট সুরক্ষা নিশ্চিত করতে প্রসেসটি পজ করা হয়েছে। আপনার মেসেজের টেক্সট বা কন্টাক্ট নাম পরিবর্তন করা উচিত কি না তা একবার যাচাই করে দেখুন।'
                });
            }
        } // This closes the `else` block.

        // Human-like delay between messages (skip after the last one)
        if (i < targets.length - 1 && !isCampaignCancelled(campaignIdString)) {
            const currentMin = Number(state.delayMinMs || delayMinMs);
            const currentMax = Number(state.delayMaxMs || delayMaxMs);

            const enableJitter = settings.enable_jitter !== 'false';
            if (enableJitter) {
                debugLog(`[Scheduler] #${id} waiting ${currentMin}-${currentMax}ms before next msg`);

                const delayValue = (Math.random() * (currentMax - currentMin) + currentMin);
                const jitterExpiresAt = Date.now() + delayValue;

                // Fetch fresh quota
                const currentQuota = await db.isDailyLimitReached();

                io.emit('process_update', {
                    id: String(id),
                    source: 'scheduled_campaign',
                    campaignId: id,
                    message: `⏳ Simulating human behavior... (${(delayValue / 1000).toFixed(1)}s)`,
                    statusDetail: 'jitter_wait',
                    current: i + 1,
                    antiBan: {
                        jitter: {
                            current: (delayValue / 1000).toFixed(1),
                            expiresAt: jitterExpiresAt
                        },
                        batchProgress: { current: state.sentSinceLastBreak || 0, total: state.nextBreakAt || 50 },
                        quota: {
                            sent: currentQuota.sent,
                            limit: currentQuota.limit
                        }
                    }
                });

                await interruptibleHumanDelay(id, currentMin, currentMax, io, i + 1);
            }

            // 🌿 Dynamic Batch Silent Break Integration for Scheduler
            const enableBatching = settings.enable_batching !== 'false';
            if (enableBatching) {
                const bMin = parseInt(settings.batch_min || 30);
                const bMax = parseInt(settings.batch_max || 50);
                const brkMin = parseInt(settings.break_min_ms || 120000);
                const brkMax = parseInt(settings.break_max_ms || 300000);

                const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
                // Ensure sane minimum for batching (Minimum 5 messages per batch for anti-ban, 1 for tests)
                const SAFE_BATCH_MIN = isTest ? bMin : Math.max(5, bMin);
                const SAFE_BATCH_MAX = isTest ? bMax : Math.max(SAFE_BATCH_MIN + 5, bMax);

                if (!state.sentSinceLastBreak) state.sentSinceLastBreak = 0;
                if (!state.nextBreakAt) state.nextBreakAt = Math.floor(Math.random() * (SAFE_BATCH_MAX - SAFE_BATCH_MIN + 1)) + SAFE_BATCH_MIN;

                state.sentSinceLastBreak++;

                if (state.sentSinceLastBreak >= state.nextBreakAt) {
                    const breakTime = Math.floor(Math.random() * (brkMax - brkMin + 1)) + brkMin;
                    const breakMins = Math.round(breakTime / 60000);

                    console.log(`[Scheduler] Batch limit reached for #${id}. Taking a silent break for ${breakMins} mins.`);

                    io.emit('process_update', {
                        id: String(id),
                        source: 'scheduled_campaign',
                        campaignId: id,
                        message: `☕ Anti-Ban Break: সিস্টেম এখন ${breakMins} মিনিটের বিশ্রাম নিচ্ছে...`,
                        type: 'warning',
                        current: i + 1,
                        statusDetail: 'batch_break',
                        breakEndsAt: Date.now() + breakTime
                    });

                    // Use interruptible delay for the break too
                    const breakStart = Date.now();
                    let breakWaitOffset = 0;
                    let logsSentInBreak = false;
                    while (Date.now() - (breakStart + breakWaitOffset) < breakTime) {
                        if (isCampaignCancelled(campaignIdString)) break;

                        const remaining = Math.max(0, breakTime - (Date.now() - (breakStart + breakWaitOffset)));

                        // Sync UI countdown during break
                        io.emit('process_update', {
                            id: String(id),
                            source: 'scheduled_campaign',
                            campaignId: id,
                            statusDetail: 'batch_break',
                            current: i + 1,
                            breakEndsAt: Date.now() + remaining
                        });

                        if (isCampaignPaused(id)) {
                            const payload = {
                                id: String(id),
                                campaignId: id,
                                statusDetail: 'paused',
                                current: i + 1,
                                breakEndsAt: Date.now() + remaining
                            };

                            if (!logsSentInBreak) {
                                payload.message = '⏸ Campaign Paused (During Batch Break).';
                                payload.type = 'warning';
                                logsSentInBreak = true;
                            }

                            io.emit('process_update', payload);

                            const heartbeat = (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) ? 10 : 1000;
                            await new Promise(r => setTimeout(r, heartbeat));
                            breakWaitOffset += heartbeat;
                            continue;
                        } else if (logsSentInBreak) {
                            logsSentInBreak = false; // Reset for next pause during same break
                        }
                        const heartbeat = (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) ? 10 : 1000;
                        await new Promise(r => setTimeout(r, heartbeat));
                    }

                    // Reset
                    state.sentSinceLastBreak = 0;
                    state.nextBreakAt = Math.floor(Math.random() * (bMax - bMin + 1)) + bMin;

                    if (!isCampaignCancelled(id)) {
                        io.emit('process_update', {
                            id: String(id),
                            source: 'scheduled_campaign',
                            campaignId: id,
                            message: `🚀 বিরতি শেষ, আবার শুরু হচ্ছে...`,
                            type: 'info',
                            current: i + 1
                        });

                        // 🛡️ Post-Break Jitter: Derived 100% from your configured jitter range
                        const pulseMin = Math.max(2000, delayMinMs / 2);
                        const pulseMax = Math.max(5000, delayMaxMs / 2);
                        const postBreakPulse = Math.floor(Math.random() * (pulseMax - pulseMin + 1)) + pulseMin;

                        const pulseStart = Date.now();
                        let pulseWaitOffset = 0;
                        while (Date.now() - (pulseStart + pulseWaitOffset) < postBreakPulse) {
                            const state = campaignState.get(campaignIdString);
                            if (state?.cancelled) {
                                break;
                            }
                            if (state?.paused) {
                                await new Promise(r => setTimeout(r, 1000));
                                pulseWaitOffset += 1000;
                                continue;
                            }
                            await new Promise(r => setTimeout(r, 1000));
                        }
                        if (isCampaignCancelled(campaignIdString)) break mainLoop;
                    }


                }
            }
        }
    }

    // ── Finalize ───────────────────────────────────────────────────────────────
    const wasCancelled = isCampaignCancelled(id);
    const finalStatus = wasCancelled ? 'cancelled' : (sentCount === 0 ? 'failed' : 'completed');

    // 🔥 Batch-Optimized Cancel Pre-Insertion (Smart Resend Logic)
    if (wasCancelled) {
        const processedCount = sentCount + failCount;
        if (processedCount < targets.length) {
            const remainingTargets = targets.slice(processedCount);
            try {
                console.log(`[Scheduler] Processing ${remainingTargets.length} unsent targets for Smart Resend...`);
                await db.bulkInsertCancelledMessages(id, remainingTargets, campaign.template_id || null);
                // Atomically increment without zeroing out or racing against the bulk insertions
                await db.incrementCampaignFailCount(id, remainingTargets.length).catch(() => { });
                failCount += remainingTargets.length; // Ensure UI progress bar syncs failed count (in-memory only for WebSocket)
            } catch (err) {
                console.error(`[Scheduler] Failed to bulk insert cancelled messages:`, err);
            }
        }
    }

    const skipFailOverride = wasCancelled && ((sentCount + failCount - (wasCancelled ? targets.slice(sentCount + failCount).length : 0)) < targets.length);
    if (!skipFailOverride) {
        await db.updateScheduledCampaignStatus(id, finalStatus, sentCount, failCount, targets.length);
    } else {
        await db.updateScheduledCampaignStatus(id, finalStatus, sentCount, 0, targets.length); // Avoid overwriting atomic additions
        const actualBroadcastFails = failCount - (targets.slice(sentCount + (failCount - targets.slice(sentCount + failCount).length)).length);
        if (actualBroadcastFails > 0) {
            await db.incrementCampaignFailCount(id, actualBroadcastFails).catch(() => { });
        }
    }

    io.emit('process_end', {
        id: String(id),
        source: 'scheduled_campaign',
        campaignId: id,
        status: wasCancelled ? 'failed' : finalStatus, // UI treats cancelled as 'failed' color
        sent: sentCount,
        failed: failCount,
        message: wasCancelled
            ? `Campaign "${name}" stopped. ${failCount - (sentCount === 0 && failCount > 0 ? failCount : 0)} unsent numbers marked for Smart Resend.`
            : failCount === 0
                ? `✅ Campaign "${name}" completed — ${sentCount} messages sent.`
                : `Campaign "${name}" done — ${sentCount} sent, ${failCount} failed.`,
    });

    io.emit('scheduled_campaign_update', { id, status: finalStatus, sent_count: sentCount, fail_count: failCount });
    io.emit('scheduled_campaigns_changed');

    // Remove from persistence
    await db.removeActiveExecution(id).catch(() => { });

    clearCampaignState(id);

    console.log(`[Scheduler] Campaign #${id} "${name}" → ${finalStatus}. Sent: ${sentCount}, Failed: ${failCount}`);
}


/**
 * initScheduler — Starts the cron job. Call this once at server startup.
 */
function initScheduler(io, db) {
    cron.schedule('* * * * *', async () => {
        try {
            const settings = await db.getAllSettings();
            debugLog(`[Scheduler] Checking due campaigns...`);

            const dueCampaigns = await db.getDueCampaigns();
            if (dueCampaigns.length === 0) return;

            console.log(`[Scheduler] Found ${dueCampaigns.length} due campaign(s). Firing...`);

            for (const campaign of dueCampaigns) {
                runCampaign(io, campaign, db).catch(e => console.error(`[Scheduler] runCampaign error:`, e));
            }
        } catch (err) {
            console.error('[Scheduler] Cron tick error:', err.message);
        }
    });

    console.log('[Scheduler] ✅ Campaign scheduler initialized — window tracking active.');
}

/**
 * Resolve {{variable}} and [Tag] placeholders in text using contact data
 */
function resolveVariables(text, contact) {
    if (!text) return '';
    let resolved = text;

    const data = {
        name: contact.name || '',
        first_name: (contact.name || '').split(' ')[0],
        phone: contact.phone || contact.number || '',
        number: contact.phone || contact.number || '',
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        city: contact.city || '',
        company: contact.companyName || contact.company_name || '',
        group: contact.group_name || '',
        email: contact.email || ''
    };

    // Standard Handlebars style {{name}}
    for (const [key, value] of Object.entries(data)) {
        const regex = new RegExp(`{{${key}}}`, 'gi');
        resolved = resolved.replace(regex, value);
    }

    // Legacy format [Name] support
    for (const [key, value] of Object.entries(data)) {
        const legacyKey = key.charAt(0).toUpperCase() + key.slice(1);
        const regex = new RegExp(`\\[${legacyKey}\\]`, 'gi');
        resolved = resolved.replace(regex, value);
    }

    return resolved;
}

/**
 * Parse {option1|option2|option3} spintax format
 */
function parseSpintax(text) {
    if (!text) return '';
    return text.replace(/{([^{}]+)}/g, (match, options) => {
        const choices = options.split('|');
        return choices[Math.floor(Math.random() * choices.length)];
    });
}

module.exports = {
    initScheduler,
    runCampaign,
    setCampaignPaused,
    setCampaignCancelled,
    updateCampaignDelay,
    updateScheduledContent,
    clearCampaignState,
    getActiveExecutionState: () => {
        for (const [id, state] of campaignState.entries()) {
            if (!state.cancelled) return { id, ...state };
        }
        return null;
    },
    recoverScheduledCampaign: async (io, db, exe) => {
        console.log(`[Scheduler] Recovering scheduled campaign #${exe.id} from index ${exe.current_index}`);

        // Re-construct the minimal campaign object needed for runCampaign
        const campaign = {
            id: exe.id,
            name: exe.payload.name,
            message: exe.payload.message,
            delayMin: exe.payload.delayMinMs,
            delayMax: exe.payload.delayMaxMs,
            execution_windows: exe.payload.execution_windows,
            respect_execution_windows: exe.payload.respect_execution_windows,
            startIndex: exe.current_index,
            sentCount: exe.current_index, // Approximating based on index
            failCount: 0,
            _recoveredTargets: exe.target_data // We can inject targets to skip resolution
        };

        // We need to slightly adjust runCampaign to accept pre-resolved targets
        // or we just let it resolve normally and use the index.
        // Let's modify runCampaign to check for _recoveredTargets.
        return runCampaign(io, campaign, db);
    }
};
