/**
 * campaign-service.js — Server-Side Instant Campaign Engine
 * Handles mass-sending via a queue-like structure to ensure reliability
 * even if the frontend browser tab is closed.
 */

'use strict';

const schedulerBus = require('./schedulerBus');
const phoneFormatter = require('./utils/phoneFormatter');
const windowHelper = require('./utils/windowHelper');

const SANE_DEFAULTS = {
    DELAY_MIN: 15000,
    DELAY_MAX: 25000,
    BATCH_MIN: 30,
    BATCH_MAX: 50,
    BREAK_MIN: 120000,
    BREAK_MAX: 300000
};


class CampaignService {
    constructor(io, db, cancelledProcesses, pausedProcesses) {
        this.io = io;
        this.db = db;
        this.cancelledProcesses = cancelledProcesses;
        this.pausedProcesses = pausedProcesses;
    }

    cancelProcess(id) {
        this.cancelledProcesses.set(id, true);
        if (this.pausedProcesses) this.pausedProcesses.delete(id);
    }

    updateActiveContent(id, text) {
        // We'll store it in a map or similar. Since CampaignService is a singleton/class instance, 
        // we can use a Map to store overrides.
        if (!this.contentOverrides) this.contentOverrides = new Map();
        this.contentOverrides.set(id, text);
        console.log(`[CampaignService] Content override applied for process ${id}`);
    }

    /**
     * Run an instant campaign from the server side
     * @param {Object} data { targets: [], text, attachments, templateId, delayMin, delayMax, startIndex, resyncCampaignId }
     */
    async runInstantCampaign(processId, data) {
        let { targets, text, attachments = [], templateId, startIndex = 0, resyncCampaignId = null } = data;

        // Fetch settings for delay and windows
        const settings = await this.db.getAllSettings();

        // 100% Settings-Driven: Try local campaign data, then global db settings, then last-resort default
        const globalMin = settings.scheduler_delay_min_ms ? parseInt(settings.scheduler_delay_min_ms) : SANE_DEFAULTS.DELAY_MIN;
        const globalMax = settings.scheduler_delay_max_ms ? parseInt(settings.scheduler_delay_max_ms) : SANE_DEFAULTS.DELAY_MAX;

        // Enterprise Unit Sanitization (seconds to ms helper)
        const sanitizeDelay = (val, fallback) => {
            const num = parseInt(val);
            if (isNaN(num) || num <= 0) return fallback;
            // If user enters < 1000, assume they meant seconds. 
            // If they enter > 1000, assume they already entered ms (failsafe).
            return num < 1000 ? num * 1000 : num;
        };

        const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
        const HARD_MIN_DELAY = isTest ? 10 : 5000; // 5s absolute minimum for anti-ban safety
        let delayMin = Math.max(HARD_MIN_DELAY, sanitizeDelay(data.delayMin, globalMin));
        let delayMax = Math.max(delayMin + 1000, sanitizeDelay(data.delayMax, globalMax));

        let { executionWindows } = data;


        // Prioritize campaign-specific windows over global
        let windows = [];
        if (executionWindows && Array.isArray(executionWindows) && executionWindows.length > 0) {
            windows = executionWindows;
        } else {
            windows = JSON.parse(settings.execution_windows || '[]');
        }

        console.log(`[CampaignService] Starting Instant Campaign ${processId} from index ${startIndex} for ${targets.length} recipients.`);
        this.cancelledProcesses.delete(processId);

        let sent = 0;
        let failed = 0;
        let localProcessedCount = 0;

        let unifiedCampaignId = resyncCampaignId;

        try {
            // 🔥 Smart Resend Sync Fix: Initialize accurate counts from DB 
            // so we don't accidentally overwrite the `campaigns` table with 0s.
            if (unifiedCampaignId) {
                const existingCmp = await this.db.getScheduledCampaignById(unifiedCampaignId);
                if (existingCmp) {
                    sent = existingCmp.sent_count || 0;
                    failed = existingCmp.fail_count || 0;
                }
            }

            // 🛡️ Pre-check Daily Quota First
            const quota = await this.db.isDailyLimitReached();
            if (quota.reached) {
                console.warn(`[CampaignService] Quota Reached: ${quota.sent}/${quota.limit}. Aborting.`);
                this.io.emit('process_update', {
                    id: processId,
                    message: `🚫 Daily Quota Reached (${quota.sent}/${quota.limit}). Please increase limit or wait until tomorrow.`,
                    type: 'error'
                });
                return;
            }

            // --- Unified DB Registration ---
            if (!unifiedCampaignId) {
                const cmp = await this.db.createScheduledCampaign({
                    name: `Instant Campaign ${new Date().toLocaleString()}`,
                    message: text,
                    type: 'instant',
                    target_type: 'contact',
                    target_id: 'bulk',
                    target_name: 'Direct List',
                    scheduled_at: null,
                    total_recipients: targets.length,
                    template_id: templateId,
                    delayMin: delayMin,
                    delayMax: delayMax,
                    execution_windows: windows,
                    respect_execution_windows: data.respectExecutionWindows ? 1 : 0
                });
                unifiedCampaignId = cmp.id;
                this.io.emit('scheduled_campaigns_changed');
            }

            // Update status immediately to running. If resyncing, don't overwrite total_recipients with the smaller resend batch size.
            await this.db.updateScheduledCampaignStatus(unifiedCampaignId, 'running', sent, failed, resyncCampaignId ? null : targets.length);

            // Persistent save for active executions (for recovery engine)
            await this.db.saveActiveExecution({
                id: processId,
                type: 'instant',
                current_index: startIndex,
                total_count: targets.length,
                status: 'running',
                target_data: targets,
                payload: { text, attachments, templateId, delayMin, delayMax, executionWindows: windows, respectExecutionWindows: data.respectExecutionWindows, resyncCampaignId: unifiedCampaignId },
                respect_execution_windows: data.respectExecutionWindows ? 1 : 0
            });

            // 🛡️ Batch Protection Setup
            const enableBatching = settings.enable_batching !== 'false';
            const bMin = parseInt(settings.batch_min || 30);
            const bMax = parseInt(settings.batch_max || 50);
            const enableJitter = settings.enable_jitter !== 'false';
            const enableWindows = settings.enable_windows !== 'false';
            const brkMin = parseInt(settings.break_min_ms || 120000);
            const brkMax = parseInt(settings.break_max_ms || 300000);

            // Ensure sane minimum for batching (Minimum 5 messages per batch for anti-ban)
            const SAFE_BATCH_MIN = isTest ? 1 : Math.max(5, bMin);
            const SAFE_BATCH_MAX = isTest ? SAFE_BATCH_MIN : Math.max(SAFE_BATCH_MIN + 5, bMax);

            let sentSinceLastBreak = 0;
            let nextBreakAt = Math.floor(Math.random() * (SAFE_BATCH_MAX - SAFE_BATCH_MIN + 1)) + SAFE_BATCH_MIN;



            this.io.emit('process_start', {
                id: processId,
                title: '🚀 Cloud Campaign (Server-Side)',
                total: targets.length,
                current: startIndex,
                antiBan: {
                    quota: { sent: quota.sent, limit: quota.limit, enabled: settings.enable_daily_limit !== 'false' },
                    batch: { enabled: enableBatching, batchSize: nextBreakAt },
                    jitter: { enabled: enableJitter, min: delayMin / 1000, max: delayMax / 1000 },
                    windows: { enabled: enableWindows }
                },
                text: text
            });

            mainLoop: for (let i = startIndex; i < targets.length; i++) {
                const spid = String(processId);
                // ⏸ Pause Check Logic (Interruptible 1s Heartbeat)
                if (this.pausedProcesses.has(spid)) {
                    console.log(`[CampaignService] Process ${spid} paused.`);
                    this.io.emit('process_update', {
                        id: processId,
                        message: `⏸ Campaign Paused. Waiting for resume...`,
                        type: 'warning',
                        current: i,
                        statusDetail: 'paused'
                    });

                    while (this.pausedProcesses.has(spid)) {
                        // Check cancellation inside pause loop
                        if (this.cancelledProcesses.has(spid)) {
                            console.log(`[CampaignService] Process ${spid} cancelled while paused.`);
                            await this.db.removeActiveExecution(processId);
                            break mainLoop;
                        }
                        await new Promise(r => setTimeout(r, 1000)); // Relaxed CPU poll
                    }

                    console.log(`[CampaignService] Process ${processId} resumed.`);
                    this.io.emit('process_update', {
                        id: processId,
                        message: `▶ Campaign Resumed. Continuing...`,
                        type: 'info',
                        current: i,
                        statusDetail: 'active'
                    });
                }

                // Check cancellation
                if (this.cancelledProcesses.has(spid)) {
                    console.log(`[CampaignService] Process ${spid} cancelled by user.`);
                    await this.db.removeActiveExecution(processId);
                    break;
                }

                // Window Check Logic
                const respectWindows = data.respectExecutionWindows !== undefined ? !!data.respectExecutionWindows : true;

                const checkWindow = async () => {
                    if (settings.enable_windows === 'false' || !respectWindows) return { isOpen: true };

                    const refreshedSettings = await this.db.getAllSettings();
                    if (refreshedSettings.enable_windows === 'false') return { isOpen: true };

                    let currentWindows = windows;
                    if (!executionWindows || !Array.isArray(executionWindows) || executionWindows.length === 0) {
                        currentWindows = JSON.parse(refreshedSettings.execution_windows || '[]');
                    }

                    const offset = parseInt(refreshedSettings.timezone_offset || 0);
                    return windowHelper.getWindowStatus(currentWindows, offset);
                };

                let windowStatus = await checkWindow();
                if (!windowStatus.isOpen) {
                    console.log(`[CampaignService] Outside windows (Eval: ${windowStatus.currentEvaluationTime}). Waiting until ${windowStatus.nextOpeningAt}.`);

                    // One-time emission to set the UI countdown and initial log
                    this.io.emit('process_update', {
                        id: processId,
                        message: `⏸ Window Closed (Eval: ${windowStatus.currentEvaluationTime}). Resuming at ${windowStatus.nextOpeningAt}.`,
                        type: 'warning',
                        current: i,
                        statusDetail: 'window_wait',
                        resumeAt: Date.now() + windowStatus.msUntilOpen
                    });

                    while (!windowStatus.isOpen) {
                        if (this.cancelledProcesses.has(spid)) {
                            console.log(`[CampaignService] Process ${spid} cancelled while waiting for window.`);
                            await this.db.removeActiveExecution(processId);
                            break mainLoop;
                        }

                        // Silence: No io.emit here during wait

                        // Respond fast to "Stop": Poll every 3 seconds instead of 30s
                        await new Promise(r => setTimeout(r, process.env.NODE_ENV === 'test' ? 1 : 3000));

                        windowStatus = await checkWindow();
                    }

                    console.log(`[CampaignService] Window re-opened at ${windowStatus.currentEvaluationTime}. Resuming...`);
                    this.io.emit('process_update', {
                        id: processId,
                        message: `🕒 Window Re-opened. Resuming...`,
                        type: 'info',
                        current: i,
                        statusDetail: 'running'
                    });
                }

                // Quota heartbeat check
                if (i > startIndex && i % 10 === 0) { // Check every 10 messages
                    const currentQuota = await this.db.isDailyLimitReached();
                    if (currentQuota.reached) {
                        this.io.emit('process_update', {
                            id: processId,
                            message: `🚫 Daily Quota Reached (${currentQuota.sent}/${currentQuota.limit}). Pulsing off.`,
                            type: 'error',
                            current: i
                        });
                        await this.db.removeActiveExecution(processId);
                        break mainLoop;
                    }
                }

                // 🌿 Dynamic Batch Silent Break
                if (enableBatching && sentSinceLastBreak >= nextBreakAt && i < targets.length - 1) {
                    const breakTime = process.env.NODE_ENV === 'test' ? 10 : (Math.floor(Math.random() * (brkMax - brkMin + 1)) + brkMin);
                    const breakMins = Math.round(breakTime / 60000);

                    console.log(`[CampaignService] Batch limit reached (${sentSinceLastBreak}). Taking a silent break for ${breakMins} mins.`);

                    this.io.emit('process_update', {
                        id: processId,
                        message: `☕ Anti-Ban Break: সিস্টেম এখন ${breakMins} মিনিটের বিশ্রাম নিচ্ছে...`,
                        type: 'warning',
                        current: i,
                        statusDetail: 'batch_break',
                        breakEndsAt: Date.now() + breakTime
                    });

                    // Interruptible break
                    const breakStart = Date.now();
                    let breakWaitOffset = 0;
                    let wasPausedBatch = false;
                    const heartbeat = process.env.NODE_ENV === 'test' ? 10 : 1000;

                    while (Date.now() - (breakStart + breakWaitOffset) < breakTime) {
                        if (this.cancelledProcesses.has(spid)) {
                            console.log(`[CampaignService] Process ${spid} cancelled during break.`);
                            await this.db.removeActiveExecution(processId);
                            break mainLoop;
                        }
                        if (this.pausedProcesses.has(spid)) {
                            wasPausedBatch = true;
                            await new Promise(r => setTimeout(r, heartbeat));
                            breakWaitOffset += heartbeat; // Freeze the break timer
                            this.io.emit('process_update', {
                                id: processId,
                                statusDetail: 'batch_break',
                                breakEndsAt: Date.now() + (breakTime - (Date.now() - (breakStart + breakWaitOffset)))
                            });
                            continue;
                        } else if (wasPausedBatch) {
                            wasPausedBatch = false;
                            this.io.emit('process_update', {
                                id: processId,
                                statusDetail: 'batch_break',
                                breakEndsAt: Date.now() + (breakTime - (Date.now() - (breakStart + breakWaitOffset)))
                            });
                        }

                        // Smart delay calculation avoiding 1ms CPU burns
                        const timeRemaining = breakTime - (Date.now() - (breakStart + breakWaitOffset));
                        const waitTime = Math.min(heartbeat, Math.max(10, timeRemaining));
                        if (waitTime > 0) {
                            await new Promise(r => setTimeout(r, waitTime));
                        } else {
                            break; // Force-break to avoid pure zero zero event loop spinning if Math rounding errors occur
                        }
                    }

                    // Reset for next batch
                    sentSinceLastBreak = 0;
                    nextBreakAt = Math.floor(Math.random() * (bMax - bMin + 1)) + bMin;

                    this.io.emit('process_update', {
                        id: processId,
                        message: `🚀 বিরতি শেষ, আবার শুরু হচ্ছে...`,
                        type: 'info',
                        current: i
                    });

                    // 🛡️ Post-Break Jitter: Derived 100% from your configured jitter range
                    const pulseMin = Math.max(2000, delayMin / 2); // Pulse is at least 2s or half delay
                    const pulseMax = Math.max(5000, delayMax / 2);
                    const postBreakPulse = process.env.NODE_ENV === 'test' ? 10 : (Math.floor(Math.random() * (pulseMax - pulseMin + 1)) + pulseMin);

                    const pulseStart = Date.now();
                    let pulseWaitOffset = 0;
                    const pulseHeartbeat = process.env.NODE_ENV === 'test' ? 10 : 1000;

                    while (Date.now() - (pulseStart + pulseWaitOffset) < postBreakPulse) {
                        if (this.cancelledProcesses.has(spid)) {
                            console.log(`[CampaignService] Process ${spid} cancelled during post-break pulse.`);
                            await this.db.removeActiveExecution(processId);
                            break mainLoop;
                        }
                        if (this.pausedProcesses.has(spid)) {
                            await new Promise(r => setTimeout(r, pulseHeartbeat));
                            pulseWaitOffset += pulseHeartbeat;
                            continue;
                        }

                        // Smart delay calculation avoiding 1ms CPU burns
                        const timeRemaining = postBreakPulse - (Date.now() - (pulseStart + pulseWaitOffset));
                        const waitTime = Math.min(pulseHeartbeat, Math.max(10, timeRemaining));
                        if (waitTime > 0) {
                            await new Promise(r => setTimeout(r, waitTime));
                        } else {
                            break;
                        }
                    }
                }



                const contact = targets[i];
                const cleanPhone = phoneFormatter.formatNumber(contact.phone || contact.number);
                const chatId = `${cleanPhone}@c.us`;

                // Resolve variables and then Spintax in text
                const currentText = (this.contentOverrides && this.contentOverrides.has(processId))
                    ? this.contentOverrides.get(processId)
                    : text;

                const resolvedVarText = this.resolveVariables(currentText, contact);
                const resolvedText = this.parseSpintax(resolvedVarText);

                // Prepare payload for WA Service
                const payload = {
                    chatId,
                    text: resolvedText,
                    to: cleanPhone,
                    contactName: contact.name,
                    contactId: contact.id || null,
                    templateId,
                    attachments,
                    // Personalization data
                    city: contact.city,
                    companyName: contact.companyName,
                    address: contact.address,
                    email: contact.email,
                    lastPurchase: contact.lastPurchase
                };

                try {
                    // Send via existing pipeline, but inject campaignId into metadata so WA service knows to bind this chat
                    this.io.emit('service_send_message', { ...payload, schedulerTracked: false, campaignId: unifiedCampaignId });

                    sent++;
                    localProcessedCount++;
                    sentSinceLastBreak++;
                    // Update DB persistence
                    await this.db.updateActiveExecutionProgress(processId, i + 1, 'running');
                    await this.db.updateScheduledCampaignStatus(unifiedCampaignId, 'running', sent, failed);

                    this.io.emit('process_update', {
                        id: processId,
                        message: `Sending: ${contact.name || cleanPhone} (${i + 1}/${targets.length})`,
                        type: 'info',
                        current: i + 1,
                        contactName: contact.name || cleanPhone || 'Unknown',
                        phone: cleanPhone || 'Unknown',
                        antiBan: {
                            batchProgress: { current: sentSinceLastBreak, total: nextBreakAt }
                        }
                    });

                } catch (err) {
                    failed++;
                    localProcessedCount++;
                    await this.db.updateScheduledCampaignStatus(unifiedCampaignId, 'running', sent, failed);
                    this.io.emit('process_update', {
                        id: processId,
                        message: `Failed: ${contact.name || cleanPhone || 'Unknown'}`,
                        type: 'error',
                        current: i + 1,
                        contactName: contact.name || cleanPhone || 'Unknown',
                        phone: cleanPhone || 'Unknown'
                    });
                }

                // Human-like delay (Interruptible - 1s heartbeat)
                if (i < targets.length - 1) {
                    const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
                    const delay = isTest ? (delayMin > 100 ? 100 : delayMin) : this.getRandomDelay(delayMin, delayMax);
                    const delayStart = Date.now();
                    const jitterExpiresAt = delayStart + delay;
                    let jitterWaitOffset = 0;

                    // Fetch fresh quota for the update
                    const currentQuota = await this.db.isDailyLimitReached();

                    this.io.emit('process_update', {
                        id: processId,
                        statusDetail: 'jitter_wait',
                        current: i + 1,
                        antiBan: {
                            jitter: {
                                current: (delay / 1000).toFixed(1),
                                expiresAt: jitterExpiresAt
                            },
                            batchProgress: { current: sentSinceLastBreak, total: nextBreakAt },
                            quota: {
                                sent: currentQuota.sent,
                                limit: currentQuota.limit
                            }
                        }
                    });

                    let wasPaused = false;
                    const heartbeat = process.env.NODE_ENV === 'test' ? 10 : 500;

                    while (Date.now() - (delayStart + jitterWaitOffset) < delay) {
                        if (this.cancelledProcesses.has(processId)) {
                            console.log(`[CampaignService] Process ${processId} cancelled during inter-message delay.`);
                            await this.db.removeActiveExecution(processId);
                            break mainLoop;
                        }
                        if (this.pausedProcesses.has(processId)) {
                            wasPaused = true;
                            await new Promise(r => setTimeout(r, heartbeat));
                            jitterWaitOffset += heartbeat;
                            // Update UI to keep countdown frozen
                            this.io.emit('process_update', {
                                id: processId,
                                antiBan: {
                                    jitter: {
                                        current: ((delay - (Date.now() - (delayStart + jitterWaitOffset))) / 1000).toFixed(1),
                                        expiresAt: Date.now() + (delay - (Date.now() - (delayStart + jitterWaitOffset)))
                                    }
                                }
                            });
                            continue;
                        } else if (wasPaused) {
                            wasPaused = false;
                            // Unpause the UI immediately
                            this.io.emit('process_update', {
                                id: processId,
                                statusDetail: 'jitter_wait',
                                antiBan: {
                                    jitter: {
                                        current: ((delay - (Date.now() - (delayStart + jitterWaitOffset))) / 1000).toFixed(1),
                                        expiresAt: Date.now() + (delay - (Date.now() - (delayStart + jitterWaitOffset)))
                                    }
                                }
                            });
                        }

                        // Smart delay calculation avoiding 1ms CPU burns
                        const timeRemaining = delay - (Date.now() - (delayStart + jitterWaitOffset));
                        const waitTime = Math.min(heartbeat, Math.max(10, timeRemaining));
                        if (waitTime > 0) {
                            await new Promise(r => setTimeout(r, waitTime));
                        } else {
                            break;
                        }
                    }

                }
            }
        } catch (error) {
            console.error(`[CampaignService] Critical error in campaign ${processId}:`, error);
            this.io.emit('process_update', {
                id: processId,
                message: `❌ Critical Error: ${error.message}`,
                type: 'error'
            });
        } finally {
            const isCancelled = this.cancelledProcesses.has(processId);
            const finalStatus = isCancelled ? 'cancelled' : 'completed';

            // 🔥 Batch-Optimized Cancel Pre-Insertion (Smart Resend Logic)
            if (isCancelled && unifiedCampaignId) {
                const totalProcessedIndices = startIndex + localProcessedCount;
                if (totalProcessedIndices < targets.length) {
                    const remainingTargets = targets.slice(totalProcessedIndices);
                    try {
                        console.log(`[CampaignService] Processing ${remainingTargets.length} unsent targets for Smart Resend...`);
                        await this.db.bulkInsertCancelledMessages(unifiedCampaignId, remainingTargets, templateId);
                        // Safely increment Database count via SQL without memory race condition override
                        await this.db.incrementCampaignFailCount(unifiedCampaignId, remainingTargets.length).catch(() => { });
                        failed += remainingTargets.length; // Add to in-memory fail count strictly for UI WebSocket emission accuracy
                    } catch (err) {
                        console.error(`[CampaignService] Failed to bulk insert cancelled messages:`, err);
                    }
                }
            }

            const finalMsg = isCancelled
                ? `Campaign stopped. ${failed - (sent === 0 && failed > 0 ? failed : 0)} unsent numbers marked for Smart Resend.`
                : `✅ Campaign finished! ${sent} messages sent.`;

            this.io.emit('process_end', {
                id: processId,
                status: finalStatus === 'cancelled' ? 'failed' : 'completed', // Maintain UI legacy coloring
                message: finalMsg
            });

            if (unifiedCampaignId) {
                // If it was cancelled AND had unsent targets, we already Atomic-Incremented fail_count above.
                // We shouldn't override the fail_count with basic 'failed' memory unless completing normally, as bulk inserts might have concurrent race additions
                const skipFailOverride = isCancelled && (startIndex + localProcessedCount < targets.length);
                if (skipFailOverride) {
                    await this.db.updateScheduledCampaignStatus(unifiedCampaignId, finalStatus, sent, 0).catch(() => { });
                    // To safeguard total accuracy without overriding, we re-apply the in-memory 'failed' count that were legitimate broadcast failures BEFORE the cancel slice
                    const actualBroadcastFails = failed - (targets.slice(startIndex + localProcessedCount).length);
                    if (actualBroadcastFails > 0) {
                        await this.db.incrementCampaignFailCount(unifiedCampaignId, actualBroadcastFails).catch(() => { });
                    }
                } else {
                    await this.db.updateScheduledCampaignStatus(unifiedCampaignId, finalStatus, sent, failed).catch(() => { });
                }
            }

            await this.db.removeActiveExecution(processId).catch(() => { });
            this.cancelledProcesses.delete(processId);
            if (this.contentOverrides) this.contentOverrides.delete(processId);
        }
    }

    /**
     * Recover stuck campaigns from DB (e.g. after server restart)
     */
    async recoverCampaigns() {
        const actives = await this.db.getActiveExecutions();
        for (const exe of actives) {
            if (exe.type === 'instant') {
                console.log(`[CampaignService] Recovering instant campaign: ${exe.id} at index ${exe.current_index}`);
                this.runInstantCampaign(exe.id, {
                    ...exe.payload,
                    targets: exe.target_data,
                    startIndex: exe.current_index
                });
            } else if (exe.type === 'scheduled') {
                const { recoverScheduledCampaign } = require('./scheduler');
                console.log(`[CampaignService] Recovering scheduled campaign: ${exe.id} at index ${exe.current_index}`);
                recoverScheduledCampaign(this.io, this.db, exe);
            }
        }
    }


    getRandomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    cancelProcess(processId) {
        this.cancelledProcesses.set(processId, true);
    }

    /**
     * Resolve {{variable}} and [Tag] placeholders in text using contact data
     */
    resolveVariables(text, contact) {
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
    parseSpintax(text) {
        if (!text) return '';
        return text.replace(/{([^{}]+)}/g, (match, options) => {
            const choices = options.split('|');
            return choices[Math.floor(Math.random() * choices.length)];
        });
    }
}

module.exports = CampaignService;
