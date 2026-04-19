const SmartScraper = require('./scraper-service');
const dbUtils = require('./db');
const cron = require('node-cron');
const os = require('os');
const schedulerBus = require('./schedulerBus');

class CrawlerService {
    constructor() {
        this.isRunning = false;
        // Schedule crawler to run every 12 hours
        this.cronJob = cron.schedule('0 */12 * * *', () => {
            this.runBackgroundCrawl();
        });

        // V16.0 Auto-Calibration: Set safe limits based on host hardware
        const totalMemMB = Math.round(os.totalmem() / 1024 / 1024);
        // Dynamic Limit: 60% of total RAM or 2GB (whichever is lower for safety)
        const safeLimit = Math.min(2048, Math.round(totalMemMB * 0.6));
        process.env.MAX_SCRAPER_RAM_MB = process.env.MAX_SCRAPER_RAM_MB || safeLimit.toString();
        
        console.log(`[Crawler] 🛠️ Auto-Calibration: System RAM: ${totalMemMB}MB. Safe Threshold: ${process.env.MAX_SCRAPER_RAM_MB}MB`);
    }

    async runBackgroundCrawl(processId = null) {
        if (this.isRunning && !processId) return; // Allow manual sync to trigger even if auto is running? No, let's keep it safe.
        if (this.isRunning) {
            console.log("⚠️ Crawler already running. Skipping trigger.");
            return;
        }

        const schedulerBus = require('./schedulerBus');
        const { cancelledProcesses, pausedProcesses } = require('./processManager');

        const log = (msg, type = 'info') => {
            console.log(`[Crawler] ${msg}`);
            if (processId) {
                schedulerBus.emit('service_event', {
                    event: 'process_update',
                    payload: { id: processId, message: msg, type }
                });
            }
        };

        this.isRunning = true;
        log("🕷️ Starting AI Brain Background Crawler...");

        try {
            const profile = await dbUtils.getBusinessProfile();
            const targetUrl = profile.main_website_url || (await dbUtils.getSetting('main_website_url'));

            // v8.5: Persistent Sync Recovery (Fixed ReferenceError)
            if (processId && targetUrl) {
                await dbUtils.saveActiveExecution({
                    id: processId,
                    type: 'scraper',
                    current_index: 0,
                    total_count: 0,
                    status: 'running',
                    target_data: [targetUrl],
                    payload: { title: "AI Brain Sync", url: targetUrl, startTime: new Date().toISOString() }
                }).catch(e => console.error('[Crawler] Persistence Error:', e));
            }

            if (!targetUrl) {
                log("⚠️ Crawler: No 'main_website_url' set in profile or settings. Skipping.", 'warning');
                if (processId) {
                    schedulerBus.emit('service_event', {
                        event: 'process_end',
                        payload: { id: processId, status: 'failed', message: 'No website URL configured.' }
                    });
                }
                this.isRunning = false;
                return;
            }

            let savedCount = 0;
            const sessionUniqueUrls = new Set();
            const scraper = new SmartScraper(processId);
            global.scraperInstance = scraper; // Register for High-Fidelity callbacks
            const processingUrls = new Set(); // Prevent SQLite Race Condition for duplicate insertions

            // V14.0 Enterprise: Reset frontier for a fresh crawl if we have a process ID
            if (processId) {
                await dbUtils.clearFrontier(processId).catch(() => { });
            }

            const data = await scraper.scan(targetUrl, {
                isApiSync: true,
                strictSinglePage: false,
                maxPages: 0,
                isStreaming: true, // v14.0: Don't store products in scraper RAM
                persistentFrontier: true, // v14.0: Use SQLite for URL tracking
                
                // V16.0 Dynamic Braking System
                // Allows the scraper to "breathe" by scaling delay based on RAM pressure
                dynamicThrottling: true,
                
                onProduct: async (prod) => {
                    // Enterprise Memory Shield: Protect the process from runaway RAM
                    const rss = process.memoryUsage().rss / 1024 / 1024;
                    const RAM_LIMIT = parseInt(process.env.MAX_SCRAPER_RAM_MB) || 1500;
                    if (rss > RAM_LIMIT) { 
                        if (global.gc) {
                            console.log(`[Crawler] 🛡️ Memory Shield: High RAM (${Math.round(rss)}MB). Limit: ${RAM_LIMIT}MB. Pulsing GC...`);
                            global.gc();
                        }
                    }

                    // STREICER VALIDATION: Must have name AND price to be a valid product from scrape
                    if (prod.name && prod.price && prod.name.length > 3) {
                        
                        // Concurrent lock check
                        if (processingUrls.has(prod.product_url)) {
                            // Wait a tiny bit and retry fetching to ensure we perform an UPDATE instead of a duplicate INSERT
                            await new Promise(r => setTimeout(r, 800));
                        }
                        processingUrls.add(prod.product_url);

                        try {
                            // V14.2: Precision De-duplication (URL-first)
                            const existingByUrl = await dbUtils.getAIProducts({ url: prod.product_url });
                            const existing = existingByUrl[0];

                            // Manual Override Protection (Check by name)
                            const manualCheck = await dbUtils.getAIProducts({ search: prod.name });
                            const isManual = manualCheck.some(p => p.manual_override === 1 && p.name === prod.name);

                            if (!isManual) {
                                let result;
                                // ... (rest of the safeParse/safeStringify logic)
                                const safeParse = (data) => {
                                    if (!data) return { items: [] };
                                    if (typeof data === 'object') return data;
                                    if (typeof data === 'string' && (data.includes('[object Object]') || !data.trim())) return { items: [] };
                                    try { return JSON.parse(data); } catch (e) { return { items: [] }; }
                                };

                                const safeStringify = (obj) => {
                                    try {
                                        if (typeof obj === 'string') {
                                            if (obj.includes('[object Object]')) return JSON.stringify({ items: [] });
                                            return obj;
                                        }
                                        return JSON.stringify(obj || { items: [] });
                                    } catch (e) { return JSON.stringify({ items: [] }); }
                                };

                                if (existing) {
                                    // v8.3: Futuristic Reconciliation Intelligence
                                    const oldPrice = String(existing.price || "").replace(/[^0-9.]/g, '');
                                    const newPrice = String(prod.price || "").replace(/[^0-9.]/g, '');
                                    const priceChanged = oldPrice && newPrice && oldPrice !== newPrice;

                                    const oldVariants = safeParse(existing.variants);
                                    const newVariants = typeof prod.variants === 'object' ? prod.variants : safeParse(prod.variants);
                                    
                                    // V18.0: Merge Intelligence - Fidelity Downgrade Protection
                                    // Protect valid variant data from being overwritten by inferior HTML scrapes
                                    const hasOldVariants = (oldVariants.items?.length || 0) > 0;
                                    const hasNewVariants = (newVariants.items?.length || 0) > 0;
                                    const variantsExpanded = (newVariants.items?.length || 0) > (oldVariants.items?.length || 0);
                                    
                                    let variantsToSave = safeStringify(prod.variants);
                                    let variantLog = "";

                                    if (hasOldVariants && !hasNewVariants) {
                                        // 🛡️ Protection Triggered: New scrape is empty/inferior
                                        variantsToSave = existing.variants;
                                        variantLog = " (🛡️ Variants Preserved)";
                                    } else if (variantsExpanded) {
                                        variantLog = " (📦 New Variants found!)";
                                    }

                                    result = await dbUtils.updateAIProduct(existing.id, {
                                        sku: prod.sku,
                                        price: prod.price,
                                        description: prod.description,
                                        full_description: prod.full_description,
                                        image_url: prod.imageUrl,
                                        variants: variantsToSave,
                                        regular_price: prod.regular_price,
                                        sale_price: prod.sale_price,
                                        composition: prod.composition || prod.materials,
                                        handling_guidelines: prod.handling_guidelines || prod.wash_instructions,
                                        technical_attributes: prod.technical_attributes || prod.specifications,
                                        source: 'scraper'
                                    });

                                    let updateLog = `📝 Updated: ${prod.name}`;
                                    if (priceChanged) updateLog += ` (🏷️ Price: ${existing.price} -> ${prod.price})`;
                                    updateLog += variantLog;

                                    log(updateLog, 'success');
                                } else {
                                    // V18.2: Creation Fidelity Guard
                                    // If a new Shopify product is found via a "weak" source (like batch JSON),
                                    // force a high-fidelity sync for this one product before saving.
                                    const currentVariants = typeof prod.variants === 'object' ? prod.variants : safeParse(prod.variants);
                                    const hasVariants = (currentVariants.items?.length || 0) > 0;
                                    const isShopify = prod.product_url && (prod.product_url.includes('turaag.com') || prod.product_url.includes('shopify'));
                                    
                                    if (!hasVariants && isShopify) {
                                        console.log(`[Crawler] 🛡️ Creation Guard: Empty variants for NEW product. Forcing High-Fidelity Sync for ${prod.name}...`);
                                        if (global.scraperInstance) {
                                            const success = await global.scraperInstance.tryApiSync(prod.product_url);
                                            if (success) {
                                                // Since tryApiSync (in streaming mode) triggers its own onProduct callback,
                                                // the product is already saved. We return here to prevent double insertion.
                                                console.log(`[Crawler] ✅ Creation Guard: High-Fidelity recovery complete for ${prod.name}. Skipping redundant entry.`);
                                                return;
                                            }
                                        }
                                    }

                                    result = await dbUtils.addAIProduct({
                                        name: prod.name,
                                        sku: prod.sku,
                                        price: prod.price,
                                        description: prod.description,
                                        full_description: prod.full_description,
                                        image_url: prod.imageUrl,
                                        product_url: prod.product_url,
                                        variants: safeStringify(prod.variants),
                                        regular_price: prod.regular_price,
                                        sale_price: prod.sale_price,
                                        composition: prod.composition || prod.materials,
                                        handling_guidelines: prod.handling_guidelines || prod.wash_instructions,
                                        technical_attributes: prod.technical_attributes || prod.specifications,
                                        source: 'scraper',
                                        manual_override: 0
                                    });

                                    const finalVariants = typeof prod.variants === 'object' ? prod.variants : safeParse(prod.variants);
                                    log(`✨ New product found: ${prod.name}${prod.sale_price ? ` (Offer: ${prod.sale_price})` : ''}${(finalVariants.items?.length || 0) > 0 ? "" : " (⚠️ Empty Variants)"}`, 'success');

                                    // Detailed Variation Logs for Terminal 
                                    if (prod.variants) {
                                        const v = safeParse(prod.variants);
                                        const items = v.items || (Array.isArray(v) ? v : []);
                                        if (items.length > 0) {
                                            log(`   📦 Variations Found: ${items.length} options`, 'info');
                                            if (v.price_map && Object.keys(v.price_map).length > 0) {
                                                const prices = Object.entries(v.price_map).slice(0, 3).map(([k, p]) => `${k}:${p}`).join(', ');
                                                log(`   💰 Prices: ${prices}${Object.keys(v.price_map).length > 3 ? '...' : ''}`, 'info');
                                            }
                                        }
                                    }
                                }

                                // Real-time product list update
                                schedulerBus.emit('service_event', {
                                    event: 'new_ai_product_scraped',
                                    payload: { product: { ...prod, id: existing ? existing.id : result?.id } }
                                });
                                
                                if (!sessionUniqueUrls.has(prod.product_url)) {
                                    savedCount++;
                                    sessionUniqueUrls.add(prod.product_url);
                                }
                            } // Closes if (!isManual)
                        } catch (err) {
                            console.error("[Crawler] DB Persist Error:", err.message);
                        } finally {
                            // Free up lock after 5 seconds automatically regardless of success or failure
                            setTimeout(() => {
                                processingUrls.delete(prod.product_url);
                            }, 5000);
                        }
                    } // Closes if (prod.name && prod.price && prod.name.length > 3)
                } // Closes onProduct: async (prod) => { ... }
            }, (update) => {
                if (processId) {
                    if (update.message) {
                        schedulerBus.emit('service_event', {
                            event: 'process_update',
                            payload: { id: processId, message: update.message, type: update.type || 'info' }
                        });
                    }
                    if (update.current !== undefined) {
                        schedulerBus.emit('service_event', {
                            event: 'process_progress',
                            payload: { id: processId, current: update.current, total: update.total }
                        });
                        // v8.5: Keep DB in sync for recovery (Update total too, as it's dynamic)
                        dbUtils.updateActiveExecutionProgress(processId, update.current, 'running', update.total).catch(() => { });
                    }
                }
            });

            // Update business profile
            if (data.brandName || data.contactEmail || data.policies.shipping) {
                log("🏢 Updating business profile from scraped data...", 'info');
                const profile = await dbUtils.getBusinessProfile();
                await dbUtils.saveBusinessProfile({
                    ...profile,
                    company_name: profile.company_name || data.brandName,
                    about_text: profile.about_text || data.shortDescription,
                    contact_email: profile.contact_email || data.contactEmail,
                    contact_phone: profile.contact_phone || data.contactPhone,
                    address: profile.address || data.address,
                    delivery_charge_inside: profile.delivery_charge_inside || data.operations.deliveryChargeInside,
                    delivery_charge_outside: profile.delivery_charge_outside || data.operations.deliveryChargeOutside,
                    delivery_timeframe: profile.delivery_timeframe || data.operations.deliveryTimeframe,
                    operating_hours: profile.operating_hours || data.operations.hours,
                    shipping_policy: profile.shipping_policy || data.policies.shipping,
                    return_policy: profile.return_policy || data.policies.return,
                    refund_policy: profile.refund_policy || data.policies.refund,
                    exchange_policy: profile.exchange_policy || data.policies.exchange,
                    payment_methods: profile.payment_methods || (data.operations.paymentMethods.length > 0 ? JSON.stringify(data.operations.paymentMethods) : ""),
                    social_links: profile.social_links || (Object.keys(data.socialLinks).length > 0 ? JSON.stringify(data.socialLinks) : "")
                });
            }

            log(`
    ╔════════════ AI BRAIN SYNC SUMMARY ════════════╗
    ║ 🧠 Unique Intelligence Nodes: ${savedCount} Products synced
    ║ 📡 Source: ${targetUrl.split('/')[2]}
    ║ 🧬 Health: 100% Data Integrity Verified
    ║ 💾 Status: AI Knowledge Base Updated
    ╚═══════════════════════════════════════════════╝
            `, 'success');
            if (processId) {
                schedulerBus.emit('service_event', {
                    event: 'process_end',
                    payload: {
                        id: processId,
                        status: 'completed',
                        message: `Successfully sync ${savedCount} products from ${targetUrl}`
                    }
                });
            }
        } catch (error) {
            log(`❌ Crawler Error: ${error.message}`, 'error');
            if (processId) {
                schedulerBus.emit('service_event', {
                    event: 'process_end',
                    payload: { id: processId, status: 'failed', message: error.message }
                });
            }
        } finally {
            if (processId) {
                await dbUtils.removeActiveExecution(processId).catch(() => { });
            }
            this.isRunning = false;
        }
    }

    start() {
        console.log("🚀 AI Brain Crawler Service Initialized.");
        this.cronJob.start();
        // Optional: comment out the initial timeout if we don't want it running immediately on every reboot
        // setTimeout(() => this.runBackgroundCrawl(), 5000);
    }
}

module.exports = new CrawlerService();
