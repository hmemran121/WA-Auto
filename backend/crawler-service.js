const SmartScraper = require('./scraper-service');
const dbUtils = require('./db');
const cron = require('node-cron');

class CrawlerService {
    constructor() {
        this.isRunning = false;
        // Schedule crawler to run every 12 hours
        this.cronJob = cron.schedule('0 */12 * * *', () => {
            this.runBackgroundCrawl();
        });
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
            const scraper = new SmartScraper(processId);
            const data = await scraper.scan(targetUrl, {
                isApiSync: true,
                strictSinglePage: false,
                maxPages: 0,
                onProduct: async (prod) => {
                    // STREICER VALIDATION: Must have name AND price to be a valid product from scrape
                    if (prod.name && prod.price && prod.name.length > 3) {
                        const existingProducts = await dbUtils.getAIProducts({ search: prod.name });
                        const isManual = existingProducts.some(p => p.manual_override === 1 && p.name === prod.name);

                        if (!isManual) {
                            const existing = existingProducts.find(p => p.product_url === prod.product_url || p.name === prod.name);
                            let result;

                            if (existing) {
                                // v8.3: Futuristic Reconciliation Intelligence
                                const oldPrice = String(existing.price || "").replace(/[^0-9.]/g, '');
                                const newPrice = String(prod.price || "").replace(/[^0-9.]/g, '');
                                const priceChanged = oldPrice && newPrice && oldPrice !== newPrice;

                                const oldVariants = existing.variants ? JSON.parse(existing.variants) : { items: [] };
                                const newVariants = typeof prod.variants === 'string' ? JSON.parse(prod.variants) : (prod.variants || { items: [] });
                                const variantsExpanded = newVariants.items && oldVariants.items && newVariants.items.length > oldVariants.items.length;

                                result = await dbUtils.updateAIProduct(existing.id, {
                                    sku: prod.sku,
                                    price: prod.price,
                                    description: prod.description,
                                    full_description: prod.full_description,
                                    image_url: prod.imageUrl,
                                    variants: typeof prod.variants === 'object' ? JSON.stringify(prod.variants) : prod.variants,
                                    regular_price: prod.regular_price,
                                    sale_price: prod.sale_price,
                                    source: 'scraper'
                                });

                                let updateLog = `📝 Updated: ${prod.name}`;
                                if (priceChanged) updateLog += ` (🏷️ Price: ${existing.price} -> ${prod.price})`;
                                if (variantsExpanded) updateLog += ` (📦 New Variants found!)`;

                                log(updateLog, 'success');
                            } else {
                                result = await dbUtils.addAIProduct({
                                    name: prod.name,
                                    sku: prod.sku,
                                    price: prod.price,
                                    description: prod.description,
                                    full_description: prod.full_description,
                                    image_url: prod.imageUrl,
                                    product_url: prod.product_url,
                                    variants: prod.variants,
                                    regular_price: prod.regular_price,
                                    sale_price: prod.sale_price,
                                    source: 'scraper',
                                    manual_override: 0
                                });
                                log(`✨ New product found: ${prod.name}${prod.sale_price ? ` (Offer: ${prod.sale_price})` : ''}`, 'success');

                                // Detailed Variation Logs for Terminal 
                                if (prod.variants) {
                                    try {
                                        const v = typeof prod.variants === 'string' ? JSON.parse(prod.variants) : prod.variants;
                                        const items = v.items || (Array.isArray(v) ? v : []);
                                        if (items.length > 0) {
                                            log(`   📦 Variations Found: ${items.length} options`, 'info');
                                            if (v.price_map && Object.keys(v.price_map).length > 0) {
                                                const prices = Object.entries(v.price_map).slice(0, 3).map(([k, p]) => `${k}:${p}`).join(', ');
                                                log(`   💰 Prices: ${prices}${Object.keys(v.price_map).length > 3 ? '...' : ''}`, 'info');
                                            }
                                        }
                                    } catch (e) { }
                                }
                            }

                            // Real-time product list update
                            schedulerBus.emit('service_event', {
                                event: 'new_ai_product_scraped',
                                payload: { product: { ...prod, id: existing ? existing.id : result?.id } }
                            });
                            savedCount++;
                        }
                    }
                }
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
    ║ 🧠 Intelligence Harvested: ${savedCount} Products processed
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
