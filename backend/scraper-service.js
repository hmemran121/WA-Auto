const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
];

class SmartScraper {
    constructor(processId = null) {
        this.processId = processId;
        this.onProductCallback = null;
        this.visited = new Set();
        this.queue = [];
        this.failedBacklog = []; // v8.2: Persistent Failure Backlog
        this.healthReport = {
            startTime: new Date(),
            endTime: null,
            successCount: 0,
            failCount: 0,
            skippedCount: 0,
            errors: {}
        };
        this.data = {
            brandName: "",
            shortDescription: "",
            fullDescription: "",
            logoUrl: "",
            contactEmail: "",
            contactPhone: "",
            address: "",
            socialLinks: {},
            policies: { shipping: "", return: "", refund: "", exchange: "" },
            operations: { deliveryChargeInside: "", deliveryChargeOutside: "", deliveryTimeframe: "", paymentMethods: [], hours: "" },
            categories: [],
            products: [],
            visitedUrls: []
        };
        this.baseUrl = "";
        this.domain = "";
        this.isStopped = false;
        this.isPaused = false;
    }

    normalizeUrl(urlStr) {
        try {
            const urlObj = new URL(urlStr);
            urlObj.hash = '';

            // Remove non-essential marketing/session query parameters
            const noiseParams = [
                '_wpnonce', 'add_to_wishlist', 'add-to-cart', 'removed_item', 'wishlist_id',
                'fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign',
                'utm_term', 'utm_content', 'v'
            ];
            noiseParams.forEach(p => urlObj.searchParams.delete(p));

            // Remove trailing slash for consistency
            return urlObj.href.replace(/\/$/, "");
        } catch {
            return urlStr;
        }
    }

    toEngDigits(str) {
        if (!str) return "";
        const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        return str.toString().replace(/[০-৯]/g, match => bnDigits.indexOf(match));
    }

    parsePrice(priceStr) {
        if (!priceStr) return { price: "", regular_price: "", sale_price: "" };

        // 1. Normalize digits
        let normalized = this.toEngDigits(priceStr);

        // 2. Range Check: Taka-aware Unicode regex
        if (/[\d\u09F3\s]+[\u2013\u2014\-][\d\u09F3\s]+/iu.test(normalized)) {
            return {
                price: normalized.trim(),
                regular_price: "",
                sale_price: ""
            };
        }

        // 3. Fallback to standard offer parsing
        // V7.0 Fix: Remove the minus sign from standard output so negative percentages don't parse as prices
        let clean = normalized
            .replace(/[^\d\s.,৳$€£]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const priceMatches = clean.match(/\d+[,\d.]*\d*/g) || [];

        if (priceMatches.length >= 2) {
            const values = priceMatches.map(p => parseFloat(p.replace(/,/g, ''))).sort((a, b) => b - a);
            const reg = values[0];
            const sale = values[1];

            return {
                price: `৳ ${sale.toLocaleString()}`,
                regular_price: `৳ ${reg.toLocaleString()}`,
                sale_price: `৳ ${sale.toLocaleString()}`
            };
        }

        return {
            price: clean,
            regular_price: "",
            sale_price: ""
        };
    }

    extractNumber(str) {
        if (!str) return null;
        const engStr = this.toEngDigits(str);
        const match = engStr.match(/\d+/);
        return match ? parseInt(match[0]) : null;
    }

    extractPriceCluster($, container) {
        const cluster = { price: "", regular_price: "", sale_price: "" };
        if (!container || container.length === 0) return cluster;

        // V6.1+ Enterprise Hardening
        const priceRegex = /[\d৳$]|Tk|BDT/i;
        const skuRegex = /SKU|ID|Model|Code|Item|Article/i;
        const potentialSkuPattern = /[A-Z]{2,}-\d+|[A-Z\d]+-[A-Z\d-]+/;
        // Unit Filtering Regex (Enterprise Grade)
        const unitRegex = /(?:\d|\s)(?:kg|gram|gm|ml|ltr|pcs|টি|কেজি|গ্রাম|পিস|প্যাকেট|packet|box|বক্স|লিটার|kg|ml)\b/i;

        // 1. Find all potential price elements
        const priceElements = container.find('span, b, strong, s, del, strike, p, div, .price, .amount, .current, .old, .regular, .sale, .woocommerce-Price-amount').filter((_, el) => {
            const text = $(el).text().trim();
            if (skuRegex.test(text) || potentialSkuPattern.test(text)) return false;
            if (text.length > 30 && !text.includes('Price:')) return false;
            return priceRegex.test(text) && text.length < 50;
        });

        let foundPrices = [];
        priceElements.each((_, el) => {
            const $el = $(el);

            // V7.1 Cross-Site Rescue: Allow deeply nested wrappers (WooCommerce <bdi>) as long as they represent ONE single discrete price
            const rawText = $el.text();
            const nums = rawText.match(/\d+[.,\d]*/g);
            if (nums && nums.length > 1) return; // Skip containers that group multiple distinct prices

            const text = rawText.replace(/\s+/g, ' ').trim();
            if (!text || text.length > 50) return;
            if (skuRegex.test(text)) return;

            // V7.0 Cross-Site Rescue: Block percentage/discount badges immediately
            if (/[%]|Save|Off|ছাড়/i.test(text)) return;

            // Clean noise (only digits, dots, commas, currency symbols, and spaces)
            let valStr = this.toEngDigits(text);

            // Priority Check: Does it look like a Unit (e.g. 3 KG)?
            const isUnit = unitRegex.test(valStr.toLowerCase());
            const hasCurrency = /৳|Tk|BDT/i.test(text);

            // Filter: If it's a unit and doesn't have a currency symbol, it's NOT a price candidate
            if (isUnit && !hasCurrency) return;

            let val = parseFloat(valStr.replace(/[^0-9.]/g, ''));
            if (isNaN(val) || val <= 0) return;

            const isRegular = /regular|old|original|price-item--regular|woocommerce-Price-amount--regular/i.test($el.attr('class') || '') ||
                ($el.css('text-decoration') || "").includes('line-through') ||
                $el.parents('del, s, strike').length > 0;

            const isSale = /sale|current|special|new|offer|price-item--sale|woocommerce-Price-amount--sale/i.test($el.attr('class') || '') ||
                $el.parents('ins').length > 0;

            // V6.3: High-Fidelity Noise Reduction
            // Reject single digits if they have no currency symbol AND no explicit price marking
            if (val < 10 && !hasCurrency && !isRegular && !isSale) return;

            foundPrices.push({ text: text, val, isRegular, isSale, hasCurrency });
        });

        // Layer 2: Range Detection Guard
        const containerText = container.text().replace(/\s+/g, ' ');
        const bodyText = $('body').text().replace(/\s+/g, ' ');

        // V7.1 Enterprise Dynamic Range Detection Guard (Ensures Currency Proximity)
        const currencies = '[৳$€£]|Tk\\.?|BDT|Rs\\.?|&#2547;';
        const rangeSeparator = '[\\u2013\\u2014\\-]|to';
        const num = '[\\d,.]+';

        // Logical Pattern rule: A valid range MUST have a currency symbol on the left side, the right side, or both, with optional spaces
        const strictRangePattern = `(?:(?:${currencies})\\s*${num}\\s*(?:${currencies})?\\s*(?:${rangeSeparator})\\s*(?:${currencies})?\\s*${num}\\s*(?:${currencies})?)|(?:(?:${currencies})?\\s*${num}\\s*(?:${currencies})?\\s*(?:${rangeSeparator})\\s*(?:${currencies})?\\s*${num}\\s*(?:${currencies}))`;
        const strictRangeRegex = new RegExp(strictRangePattern, 'iu');

        // Extraction Pattern allows optional trailing/leading symbols as long as one is present
        const extractRangePattern = strictRangePattern; // Same robust logic
        const extractRangeRegex = new RegExp(extractRangePattern, 'iu');

        const hasRangeSeparator = strictRangeRegex.test(containerText) || strictRangeRegex.test(bodyText);
        const hasExplicitStrike = foundPrices.some(p => p.isRegular);

        // 2. Dedup and Rank
        const uniquePrices = [];
        const seenVals = new Set();
        foundPrices.sort((a, b) => (b.isRegular ? 2 : (b.isSale ? 1 : 0)) - (a.isRegular ? 2 : (a.isSale ? 1 : 0)));

        foundPrices.forEach(p => {
            if (!seenVals.has(p.val)) {
                uniquePrices.push(p);
                seenVals.add(p.val);
            }
        });

        if (uniquePrices.length >= 2) {
            if (hasRangeSeparator && !hasExplicitStrike) {
                // Try to extract the whole range string dynamically based on the strict rule
                const rangeMatch = containerText.match(extractRangeRegex);
                if (rangeMatch) {
                    cluster.price = rangeMatch[0].trim();
                    return cluster;
                }
            }
            const validPrices = uniquePrices.filter(p => !/[%]|Save|Off/i.test(p.text));

            // Priority 1: Pick Regular and Sale that have currency symbols
            const symbolPrices = validPrices.filter(p => p.hasCurrency);

            let reg = validPrices.find(p => p.isRegular);
            let sale = validPrices.find(p => p.isSale || (!p.isRegular && p !== reg));

            // Layer 4: Logical Comparison Fallback
            // V7.2 Fix: ONLY fallback to guessing Reg/Sale if we have an explicit strike-through OR if we are very sure it's not a range
            if ((!reg || !sale) && validPrices.length >= 2 && (hasExplicitStrike || !hasRangeSeparator)) {
                validPrices.sort((a, b) => b.val - a.val);
                reg = validPrices[0];
                sale = validPrices[1];
            }

            // High-Fidelity Override: If we have a price with a symbol, use it!
            if (symbolPrices.length > 0 && (!sale || !sale.hasCurrency)) {
                sale = symbolPrices[0];
            }

            if (reg && sale && reg.val > sale.val && (hasExplicitStrike || (reg.isRegular || sale.isSale))) {
                cluster.regular_price = reg.text.match(/[\d,.]+/)?.[0] || reg.text;
                cluster.sale_price = sale.text.match(/[\d,.]+/)?.[0] || sale.text;
                cluster.price = cluster.sale_price;
            } else if (hasRangeSeparator) {
                // Return range instead of guessing sale
                const rangeMatch = containerText.match(extractRangeRegex);
                cluster.price = rangeMatch ? rangeMatch[0].trim() : `${uniquePrices[uniquePrices.length - 1].val} - ${uniquePrices[0].val}`;
            } else {
                cluster.price = (symbolPrices.length > 0 ? symbolPrices[0].text : validPrices[0].text);
            }
        } else if (uniquePrices.length === 1) {
            cluster.price = uniquePrices[0].text;
        }

        return cluster;
    }

    extractSKU($, container) {
        if (!container || container.length === 0) return "";

        // 1. Direct label search with strict proximity
        const skuLabels = container.find('span, p, div, li, strong').filter((_, el) => {
            const text = $(el).text().trim();
            return /^(SKU|Model|Item Code|Product Code):/i.test(text) && text.length < 100;
        });

        if (skuLabels.length > 0) {
            let labelText = skuLabels.first().text().trim();
            // Stricter Extraction: Use only the word immediately after label or colon
            const parts = labelText.split(/[:\s]/).map(s => s.trim()).filter(s => s.length > 0);
            let sku = "";

            // Loop and find first part that looks like a real SKU (alphanumeric with hyphen/number)
            // AND ensure it doesn't look like a UI/Category label
            for (let i = 1; i < parts.length; i++) {
                const p = parts[i];
                if (/^[A-Z\d-]+$/i.test(p) && p.length > 3 && !/Category|Price|Popular|Home|Product|Shop/i.test(p)) {
                    sku = p;
                    break;
                }
            }

            if (!sku) {
                const nextText = skuLabels.first().next().text().trim().split(/\s/)[0];
                if (/^[A-Z\d-]+$/i.test(nextText) && nextText.length > 3 && !/Category|Price|Popular|Home|Product|Shop/i.test(nextText)) {
                    sku = nextText;
                }
            }

            if (sku) return sku;
        }

        // 2. Class search (more reliable for WooCommerce/Shopify)
        const skuByClass = container.find('.sku, .product_sku, .product-sku, [itemprop="sku"]').first().text().trim();
        if (skuByClass && skuByClass.length < 50) return skuByClass;

        return "";
    }

    extractPolicySection($, keywords) {
        try {
            // Enterprise Isolation: Work on a clone to prevent flow destruction
            const $body = $('body').clone();

            // 1. Deep Noise Stripping
            $body.find('script, style, noscript, header, footer, nav, form, iframe, button, svg, [role="navigation"], .header, .footer').remove();

            const blocks = [];
            // Target semantic containers
            $body.find('p, div, section, article, .entry-content, #content, .product-description').each((_, el) => {
                const $el = $(el);
                const text = $el.text().toLowerCase();
                if (text.length < 20) return;

                let score = 0;
                keywords.forEach(kw => {
                    const regex = new RegExp(kw, 'gi');
                    const matches = text.match(regex);
                    if (matches) score += matches.length * 10;
                });

                // Bonus for proximity to "policy" or "terms"
                if (text.includes('policy') || text.includes('টার্মস') || text.includes('শর্তাবলী')) score += 5;

                if (score > 0) {
                    blocks.push({
                        score,
                        html: $el.html().replace(/\s+/g, ' ').trim(),
                        text: $el.text().replace(/\s+/g, ' ').trim()
                    });
                }
            });

            if (blocks.length === 0) return "";

            // Sort by score and pick top hits
            blocks.sort((a, b) => b.score - a.score);

            // Take the best block, or join top 2 if they are highly relevant
            const bestContent = blocks[0].text;
            return bestContent.length > 5000 ? bestContent.slice(0, 5000) : bestContent;
        } catch (e) {
            console.error("[Scraper] Policy Extraction Error:", e.message);
            return "";
        }
    }

    decodeEntities(text) {
        if (!text) return "";
        return text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&apos;/g, "'");
    }

    safeDecode(str) {
        if (!str) return "";
        try {
            // Check if it's actually encoded
            if (str.includes('%')) {
                return decodeURIComponent(str);
            }
            return str;
        } catch (e) {
            return str;
        }
    }

    cleanImageUrl(url) {
        if (!url) return '';
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) {
            try {
                return new URL(url, this.baseUrl).href;
            } catch (e) { return url; }
        }
        return url;
    }

    normalizeProduct(prod) {
        let normalized = { ...prod };
        normalized.name = (prod.name || "").replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
        normalized.sku = (prod.sku || "").trim();

        const priceData = this.parsePrice(prod.price || "");

        // V5.0: Direct Offer Injection Priority
        // High Precision Fix: Preserve decimal prices from API and ensure BDT consistency with type safety
        normalized.regular_price = String(prod.regular_price || priceData.regular_price || "").trim();
        if (normalized.regular_price && !normalized.regular_price.includes('৳') && !normalized.regular_price.includes('Tk')) {
            normalized.regular_price = `৳ ${normalized.regular_price}`;
        }

        normalized.sale_price = String(prod.sale_price || priceData.sale_price || "").trim();
        if (normalized.sale_price && !normalized.sale_price.includes('৳') && !normalized.sale_price.includes('Tk')) {
            normalized.sale_price = `৳ ${normalized.sale_price}`;
        }

        // Logic: Main price is ALWAYS the sale price if available
        let finalP = String(normalized.sale_price || prod.price || priceData.price || "").trim();
        if (finalP && !finalP.includes('৳') && !finalP.includes('Tk')) {
            finalP = `৳ ${finalP}`;
        }
        normalized.price = finalP;

        // V3: Structured Variants with Price Map
        let rawVariants = [];
        let priceMap = prod.price_map || {};

        if (prod.variants && typeof prod.variants === 'object' && !Array.isArray(prod.variants)) {
            rawVariants = prod.variants.variants || [];
            priceMap = prod.variants.price_map || priceMap;
        } else {
            rawVariants = Array.isArray(prod.variants) ? prod.variants : [];
        }

        let sizes = new Set();
        let colors = new Set();
        let minPrice = Infinity;

        const processedVariants = rawVariants.map(v => {
            const vPrice = this.toEngDigits(v.price || "");
            const numericPrice = parseFloat(vPrice.replace(/[^0-9.]/g, ''));

            if (!isNaN(numericPrice) && numericPrice < minPrice && numericPrice > 0) {
                minPrice = numericPrice;
            }

            const val = String(v.value || v.title || "").trim();
            if (val) {
                // Heuristic: Identify if value is likely a color or size
                if (val.match(/red|blue|green|black|white|yellow|pink|purple|orange|brown/i)) {
                    colors.add(val);
                } else if (val.match(/S|M|L|XL|XXL|XXXL|[0-9]+(?:kg|gm|ml|ltr|পিস|টি)/i)) {
                    sizes.add(val);
                } else {
                    sizes.add(val); // Default to sizes for generic variants
                }
            }

            return {
                type: v.type || "Option",
                value: val,
                price: vPrice,
                regular_price: v.regular_price || "",
                sale_price: v.sale_price || "",
                sku: v.sku || "",
                imageUrl: this.cleanImageUrl(v.image_url || v.imageUrl || "")
            };
        });

        // Sync priceMap from processed variants if empty
        if (Object.keys(priceMap).length === 0 && processedVariants.length > 0) {
            processedVariants.forEach(v => {
                if (v.value && v.price) priceMap[v.value] = v.price;
            });
        }

        normalized.variants = JSON.stringify({
            items: processedVariants,
            price_map: priceMap,
            sizes: Array.from(sizes),
            colors: Array.from(colors)
        });

        // Dynamic Baseline Price: If variants exist, ensure main price is the Lowest available
        // BUT: Protect price ranges (containing Unicode dashes) from being overridden
        const containsRange = /[\u2013\u2014\-]/.test(String(normalized.price));
        if (minPrice !== Infinity && !containsRange) {
            const currentPrice = parseFloat(normalized.price.replace(/[^0-9.]/g, ''));
            if (isNaN(currentPrice) || currentPrice > minPrice || currentPrice === 0) {
                normalized.price = minPrice.toFixed(2);
            }
        }

        return normalized;
    }

    cleanDescription(el) {
        // Remove scripts, styles, and hidden elements from description
        el.find('script, style, .hidden, #hidden, [style*="display:none"]').remove();
        return el.text().replace(/\s+/g, ' ').trim();
    }

    async scan(startUrl, options = { strictSinglePage: false, isApiSync: true, maxPages: 0, onProduct: null }, onUpdate = null) {
        this.onProductCallback = options.onProduct;
        const log = (msg, type = 'info') => {
            console.log(`[Scraper] ${msg}`);
            if (onUpdate) onUpdate({ message: msg, type });
        };

        try {
            this.baseUrl = this.normalizeUrl(startUrl);
            this.domain = new URL(this.baseUrl).hostname;

            // v4: Stagnation tracking (Enterprise Grade)
            let lastProductAddedAt = 0;
            let stopReason = "Limit Reached";

            log(`🚀 Starting Enterprise Intelligent Scan: ${startUrl}`);

            // 1. Direct API Sync check (Shopify/WooCommerce)
            if (options.isApiSync) {
                const apiSuccess = await this.tryApiSync(startUrl);
                if (apiSuccess) {
                    log("✅ API Sync Complete via JSON endpoint.", 'success');
                }
            }

            // 2. Queue management
            this.queue.push({ url: this.baseUrl, priority: 100, type: 'home' });

            let pagesProcessed = 0;
            // v8.3: Default to Unlimited (0) for background tasks, otherwise use provided limit
            let currentLimit = options.strictSinglePage ? 1 : (options.maxPages === 0 ? Infinity : (options.maxPages || 10000));
            const baseStagnationThreshold = 50;

            while (this.queue.length > 0 && pagesProcessed < currentLimit) {
                // v8.0 Adaptive Scaling: If we are finding many products, intelligently extend the limit
                // This allows Pickaboo (24k+ products) to be fully crawled if needed
                if (this.data.products.length > (currentLimit * 0.4) && currentLimit !== Infinity && !options.strictSinglePage) {
                    const newLimit = Math.min(10000, currentLimit + 500); // Gradual expansion
                    if (newLimit > currentLimit) {
                        currentLimit = newLimit;
                    }
                }

                // Check Global Process Controls if processId exists
                if (this.processId) {
                    const { cancelledProcesses, pausedProcesses } = require('./processManager');

                    if (cancelledProcesses && cancelledProcesses.has(this.processId)) {
                        log("🛑 Scraper stopped by user.", 'warning');
                        this.isStopped = true;
                    }

                    while (pausedProcesses && pausedProcesses.has(this.processId) && !this.isStopped) {
                        if (onUpdate) onUpdate({ message: "⏸️ Scraper paused...", type: 'warning', isPaused: true });
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        if (cancelledProcesses && cancelledProcesses.has(this.processId)) {
                            this.isStopped = true;
                            break;
                        }
                    }
                }

                if (this.isStopped) break;

                // Sort queue by priority
                this.queue.sort((a, b) => b.priority - a.priority);
                const { url, priority, type, lastScraped } = this.queue.shift();
                const normalized = this.normalizeUrl(url);

                if (this.visited.has(normalized)) continue;
                this.visited.add(normalized);
                pagesProcessed = this.visited.size;

                log(`🕷️ Visiting [${type.toUpperCase()}] (${pagesProcessed}/${currentLimit}): ${url}`);

                if (onUpdate) {
                    onUpdate({
                        current: pagesProcessed,
                        total: currentLimit,
                        productCount: this.data.products.length,
                        status: `Crawling ${type}...`
                    });
                }

                try {
                    const beforeCount = this.data.products.length;
                    const beforeQueueSize = this.queue.length; // Correctly defined here
                    const html = await this.fetchPage(url, 0, lastScraped);

                    // v8.2.1: Freshness is NOT Stagnation
                    if (html === "NOT_MODIFIED") {
                        this.healthReport.skippedCount++;
                        lastProductAddedAt = pagesProcessed; // Reset stagnation on successful skip
                        continue;
                    }

                    if (!html) {
                        this.healthReport.failCount++;
                        this.failedBacklog.push({ url, type, error: 'Network Failure/Timeout', timestamp: new Date() });
                        continue;
                    }

                    this.healthReport.successCount++;
                    const $ = cheerio.load(html);
                    await this.processPage($, url, type);
                    this.data.visitedUrls.push(url);

                    const afterCount = this.data.products.length;
                    const afterQueueSize = this.queue.length;

                    // v8.2.1: Activity Detection (Product found OR New Links discovered)
                    const activityDetected = (afterCount > beforeCount) || (afterQueueSize > beforeQueueSize);

                    if (activityDetected || type === 'sitemap') {
                        lastProductAddedAt = pagesProcessed; // Heartbeat: Reset stagnation

                        if (afterCount > currentLimit * 0.4 && currentLimit < 10000) {
                            currentLimit = Math.min(10000, currentLimit + 500);
                            log(`📈 Adaptive Scaling: Expanding limit to ${currentLimit}...`);
                        }
                    }

                    // V8.0: Intelligent Stagnation check
                    const dynamicStagnation = (type === 'pagination' || type === 'category') ? baseStagnationThreshold * 2 : baseStagnationThreshold;
                    if (pagesProcessed - lastProductAddedAt > dynamicStagnation && pagesProcessed > 30) {
                        log(`🛑 Intelligent Stop: No new products found in last ${dynamicStagnation} pages.`, 'warning');
                        stopReason = "Stagnation Detected";
                        break;
                    }
                } catch (e) {
                    log(`⚠️ Error processing ${url}: ${e.message}`, 'error');
                    const errKey = e.code || 'PROC_ERR';
                    this.healthReport.errors[errKey] = (this.healthReport.errors[errKey] || 0) + 1;
                    this.healthReport.failCount++;
                    this.failedBacklog.push({ url, type, error: e.message, timestamp: new Date() });
                }
                pagesProcessed++;

                // v8.0 Intelligent Stagnation check
                // If we are on a pagination page, we give more leeway as products might be on the next page
                const dynamicStagnationThreshold = (type === 'pagination' || type === 'category') ? baseStagnationThreshold * 2 : baseStagnationThreshold;

                if (pagesProcessed - lastProductAddedAt > dynamicStagnationThreshold && pagesProcessed > 20) {
                    log(`🛑 Intelligent Stop: No new products found in last ${dynamicStagnationThreshold} pages. Ending scan.`, 'warning');
                    stopReason = "Stagnation Detected";
                    break;
                }

                if (onUpdate) {
                    onUpdate({
                        current: pagesProcessed,
                        total: currentLimit === Infinity ? "Unlimited" : currentLimit,
                        progress: currentLimit === Infinity ? 0 : Math.round((pagesProcessed / currentLimit) * 100),
                        productCount: this.data.products.length,
                        status: `Crawling... (${pagesProcessed}${currentLimit === Infinity ? "" : "/" + currentLimit})`
                    });
                }

                // v8.2: Self-Correction Pass (Triggered when main queue is low or limit reached)
                if (this.queue.length === 0 && this.failedBacklog.length > 0 && this.visited.size < currentLimit) {
                    onUpdate({ message: `🔄 Initiating Self-Correction Pass on ${this.failedBacklog.length} failed pages...`, type: 'info' });
                    const toRetry = this.failedBacklog.splice(0, 10); // Batch retry
                    toRetry.forEach(item => {
                        this.visited.delete(this.normalizeUrl(item.url)); // Allow re-visit
                        this.queue.push({ ...item, priority: 50, retryPass: true });
                    });
                }

                // Prevent event loop block
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (this.queue.length === 0) stopReason = "Queue Exhausted";
            log(`✅ Scan Complete. Reason: ${stopReason}. Extracted ${this.data.products.length} Products.`, 'success');
            this.healthReport.endTime = new Date();
            this.generateHealthReport();
            return this.data;
        } catch (error) {
            log(`❌ Scraper Error: ${error.message}`, 'error');
            this.healthReport.endTime = new Date();
            this.healthReport.errors['CRITICAL_SCAN_ERROR'] = (this.healthReport.errors['CRITICAL_SCAN_ERROR'] || 0) + 1;
            this.generateHealthReport();
            throw error;
        }
    }

    async tryApiSync(url) {
        try {
            const urlObj = new URL(url);

            // 1. Deep Shopify JSON Strategy
            if (urlObj.pathname.includes('/products/')) {
                const productJsonUrl = url.split('?')[0] + '.json';
                const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
                const resp = await axios.get(productJsonUrl, {
                    headers: { 'User-Agent': ua, 'Accept': 'application/json' },
                    timeout: 8000
                }).catch(() => null);

                if (resp && resp.data && resp.data.product) {
                    const p = resp.data.product;
                    const price_map = {};

                    // Recursive variant parsing to ensure exact title/price mapping
                    const variants = (p.variants || []).map(v => {
                        const options = [];
                        if (v.option1) options.push(v.option1);
                        if (v.option2) options.push(v.option2);
                        if (v.option3) options.push(v.option3);

                        const val = options.join(' / ') || v.title;
                        if (val && v.price) {
                            price_map[val] = this.toEngDigits(String(v.price));
                        }

                        return {
                            type: p.options && p.options[0] ? p.options[0].name : "Variant",
                            value: val,
                            price: v.price,
                            regular_price: v.compare_at_price || v.price,
                            sale_price: v.price,
                            sku: v.sku,
                            image_id: v.image_id
                        };
                    });

                    // Match variant images if possible
                    let mainImg = p.image ? p.image.src : (p.images && p.images[0] ? p.images[0].src : "");

                    await this.addProduct(this.normalizeProduct({
                        name: p.title,
                        price: p.variants && p.variants[0] ? p.variants[0].price : "",
                        regular_price: p.variants && p.variants[0] ? p.variants[0].compare_at_price : "",
                        sale_price: p.variants && p.variants[0] ? p.variants[0].price : "",
                        full_description: p.body_html ? this.cleanHtmlDescription(p.body_html) : "",
                        description: "",
                        imageUrl: mainImg,
                        product_url: url.split('?')[0],
                        variants: variants,
                        price_map: price_map
                    }));
                    return true;
                }
            }

            // 2. Global Shopify /products.json check (for collection sync)
            const shopifyUrl = new URL('/products.json?limit=250', this.baseUrl).href;
            const respGlobal = await axios.get(shopifyUrl, { timeout: 10000 }).catch(() => null);

            if (respGlobal && respGlobal.data && Array.isArray(respGlobal.data.products)) {
                for (const p of respGlobal.data.products) {
                    const price_map = {};
                    const variants = (p.variants || []).map(v => {
                        if (v.title && v.price) price_map[v.title] = this.toEngDigits(String(v.price));
                        return {
                            type: "Option",
                            value: v.title,
                            price: v.price,
                            regular_price: v.compare_at_price || v.price,
                            sale_price: v.price,
                            sku: v.sku
                        };
                    });

                    await this.addProduct(this.normalizeProduct({
                        name: p.title,
                        price: p.variants && p.variants[0] ? p.variants[0].price : "",
                        regular_price: p.variants && p.variants[0] ? p.variants[0].compare_at_price : "",
                        sale_price: p.variants && p.variants[0] ? p.variants[0].price : "",
                        full_description: p.body_html ? this.cleanHtmlDescription(p.body_html) : "",
                        description: "",
                        imageUrl: p.images && p.images[0] ? p.images[0].src : "",
                        product_url: new URL(`/products/${p.handle}`, this.baseUrl).href,
                        variants: variants,
                        price_map: price_map
                    }));
                }
                return true;
            }
        } catch (e) {
            console.log("API Sync failed:", e.message);
        }
        return false;
    }

    async fetchPage(url, retryCount = 0, lastScraped = null) {
        const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        const maxRetries = 2;

        try {
            const headers = {
                'User-Agent': ua,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache'
            };

            // v8.2: Incremental Sync Headers
            if (lastScraped) {
                headers['If-Modified-Since'] = new Date(lastScraped).toUTCString();
            }

            const response = await axios.get(url, {
                headers,
                timeout: 20000, // Increased timeout for heavy sites
                validateStatus: s => s === 200 || s === 304
            });

            if (response.status === 304) {
                console.log(`[Scraper] ⚡ Skipped (Not Modified): ${url}`);
                return "NOT_MODIFIED";
            }

            return response.data;
        } catch (error) {
            const isConnReset = error.code === 'ECONNRESET' || error.message.includes('disconnected');
            const isTimeout = error.code === 'ECONNABORTED' || error.message.includes('timeout');

            if ((isConnReset || isTimeout) && retryCount < maxRetries) {
                console.log(`[Scraper] 🔄 Retrying ${url} (${retryCount + 1}/${maxRetries}) due to ${error.code || 'timeout'}...`);
                await new Promise(r => setTimeout(r, 2000 * (retryCount + 1))); // Exponential backoff
                return this.fetchPage(url, retryCount + 1, lastScraped);
            }

            // Track error health
            const errKey = error.code || 'UNKNOWN';
            this.healthReport.errors[errKey] = (this.healthReport.errors[errKey] || 0) + 1;

            console.log(`[Scraper] ❌ Failed to fetch ${url}: ${error.message}`);
            return null;
        }
    }

    generateHealthReport() {
        const duration = ((this.healthReport.endTime - this.healthReport.startTime) / 1000).toFixed(1);

        let report = `# Crawl Health Report: ${this.baseUrl}\n\n`;
        report += `- **Duration:** ${duration}s\n`;
        report += `- **Total Visited:** ${this.visited.size}\n`;
        report += `- **Successful:** ${this.healthReport.successCount}\n`;
        report += `- **Skipped (304):** ${this.healthReport.skippedCount}\n`;
        report += `- **Failed:** ${this.healthReport.failCount}\n\n`;

        report += `## Error Distribution\n`;
        Object.entries(this.healthReport.errors).forEach(([err, count]) => {
            report += `- \`${err}\`: ${count}\n`;
        });

        if (this.failedBacklog.length > 0) {
            report += `\n## Persistent Failures (Backlog)\n`;
            this.failedBacklog.forEach(item => {
                report += `- [ ] [${item.url}](${item.url}) - Error: ${item.error}\n`;
            });
        }

        try {
            const auditPath = path.join(__dirname, 'crawl_health_report.md');
            fs.writeFileSync(auditPath, report);
            console.log(`[Scraper] 📊 Health Report generated: ${auditPath}`);
        } catch (e) {
            console.error("Failed to write health report:", e);
        }
    }

    async processPage($, url, type) {
        // v8.2: Unified processing and discovery entry point
        // Only extract product/brand info for HTML pages, not XML sitemaps
        if (type !== 'sitemap') {
            await this.extractInfo($, url, type);
        }

        // Discovery logic (Skip if specific type)
        if (type !== 'product') {
            await this.discoverSitemaps($, url);
            await this.discoverLinks($, url);
            await this.discoverPagination($, url);
        }
    }

    async discoverSitemaps($, currentUrl) {
        const sitemapLinks = [];

        // v8.1 Enterprise Discovery: Proactively check robots.txt if at homepage
        const isHome = this.normalizeUrl(currentUrl) === this.baseUrl;
        if (isHome) {
            try {
                const robotsUrl = new URL('/robots.txt', this.baseUrl).href;
                const robotsTxt = await this.fetchPage(robotsUrl);
                if (robotsTxt) {
                    const matches = robotsTxt.match(/^Sitemap:\s*(https?:\/\/\S+)/gmi);
                    if (matches) {
                        matches.forEach(m => {
                            const loc = m.replace(/^Sitemap:\s*/i, '').trim();
                            sitemapLinks.push({ loc });
                            console.log(`[Scraper] 🤖 Found sitemap in robots.txt: ${loc}`);
                        });
                    }
                }
            } catch (e) {
                // Ignore robots.txt errors
            }

            // Expanded common sitemap locations
            const common = [
                '/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml',
                '/sitemap/sitemap.xml', '/sitemap/sitemap_index.xml',
                '/sitemap_products_1.xml', '/sitemap-products.xml'
            ];
            common.forEach(path => {
                const loc = new URL(path, this.baseUrl).href;
                sitemapLinks.push({ loc });
            });
        }

        // Look for sitemap links if current page IS a sitemap (sitemapindex/urlset)
        const html = $.html();
        if (currentUrl.endsWith('.xml') || /<sitemapindex|<urlset/i.test(html)) {
            const content = html;
            // Match <url> or <sitemap> blocks to get <loc> and <lastmod>
            const urlMatches = content.match(/<(?:url|sitemap)\b[^>]*>([\s\S]*?)<\/(?:url|sitemap)>/gi);
            if (urlMatches) {
                urlMatches.forEach(block => {
                    const loc = (block.match(/<loc\b[^>]*>(.*?)<\/loc>/i) || [])[1];
                    const lastmod = (block.match(/<lastmod\b[^>]*>(.*?)<\/lastmod>/i) || [])[1];
                    if (loc) {
                        sitemapLinks.push({ loc, lastmod });
                    }
                });
            } else {
                // Fallback for compact loc matches
                const locMatches = content.match(/<loc\b[^>]*>(.*?)<\/loc>/gi);
                if (locMatches) {
                    locMatches.forEach(m => {
                        const loc = m.replace(/<loc\b[^>]*>/i, '').replace(/<\/loc>/i, '');
                        sitemapLinks.push({ loc });
                    });
                }
            }
        }

        for (const item of sitemapLinks) {
            const link = item.loc;
            if (!link) continue;
            const normalized = this.normalizeUrl(link);
            if (this.visited.has(normalized)) continue;

            // V8.6 Intelligent Classification for Sitemap Links
            const isProductUrl = normalized.includes('/product/') || normalized.includes('/products/') || normalized.includes('/item/') || normalized.includes('/p/');
            const isSitemapFile = normalized.endsWith('.xml') || (normalized.includes('sitemap') && !isProductUrl);

            if (isProductUrl) {
                this.queue.push({
                    url: normalized,
                    priority: 100, // Top priority for sitemap-derived products
                    type: 'product',
                    lastScraped: item.lastmod
                });
            } else if (isSitemapFile) {
                this.queue.push({
                    url: normalized,
                    priority: 98,
                    type: 'sitemap',
                    lastScraped: item.lastmod
                });
            } else {
                // Likely a category or general page from a sitemap
                this.queue.push({
                    url: normalized,
                    priority: 80,
                    type: 'general',
                    lastScraped: item.lastmod
                });
            }
        }
    }

    discoverPagination($, currentUrl) {
        const paginationSelectors = [
            '.next', '.pagination-next', '.next-page', 'a[rel="next"]',
            '.woocommerce-pagination .next', '.pagination .active + li a',
            '.pagination .current + a', 'a.next.page-number', '.next.page-number'
        ];

        let foundNext = false;

        for (const selector of paginationSelectors) {
            const link = $(selector).attr('href');
            if (link && this.queuePagination(link, currentUrl)) {
                foundNext = true;
                break;
            }
        }

        if (!foundNext) {
            $('a').each((_, el) => {
                const text = $(el).text().toLowerCase().trim();
                const href = $(el).attr('href');
                if (href && (
                    text.includes('next') ||
                    text.includes('পরবর্তী') ||
                    text === '>' ||
                    text === '»' ||
                    (text.match(/^\d+$/) && parseInt(text) > 1) // Digits can be page numbers
                )) {
                    // If it's just a number, it's a page link, lower priority but still useful
                    const priority = text.match(/^\d+$/) ? 90 : 95;
                    this.queuePagination(href, currentUrl, priority);
                }
            });
        }
    }

    queuePagination(href, currentUrl, priority = 95) {
        try {
            const urlObj = new URL(href, currentUrl);
            const fullUrl = this.normalizeUrl(urlObj.href);

            if (urlObj.hostname !== this.domain && !urlObj.hostname.endsWith('.' + this.domain)) return false;

            if (this.visited.has(fullUrl)) return false;

            // Check if already in queue
            if (this.queue.some(q => q.url === fullUrl)) return true;

            this.queue.push({ url: fullUrl, priority: priority, type: 'pagination' });
            return true;
        } catch (e) {
            return false;
        }
    }

    async extractInfo($, url, pageType) {
        const bodyText = $('body').text();
        const cleanText = bodyText.replace(/\s+/g, ' ').trim();

        // 1. Brand Identity
        if (!this.data.brandName) {
            const rawTitle = $('title').text().trim();
            this.data.title = rawTitle;
            let cleanBrand = rawTitle.split(/[-|]/)[0].trim().replace(/Home\s*$/i, '').trim();

            const logoAlt = $('img[src*="logo"], .logo img, a[href="/"] img').first().attr('alt');
            if (logoAlt && logoAlt.length > 2 && logoAlt.length < 30) cleanBrand = logoAlt;

            this.data.brandName = cleanBrand;
        }

        // 2. Contact Info
        if (!this.data.contactEmail) {
            const mailto = $('a[href^="mailto:"]').first().attr('href');
            if (mailto) this.data.contactEmail = mailto.replace('mailto:', '').split('?')[0];
            else {
                const match = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                if (match) this.data.contactEmail = match[0];
            }
        }
        if (!this.data.contactPhone) {
            const tel = $('a[href^="tel:"]').first().attr('href');
            if (tel) this.data.contactPhone = tel.replace('tel:', '');
            else {
                const match = bodyText.match(/(?:\+88|01)[3-9][0-9]{8}/); // BD phone pattern
                if (match) this.data.contactPhone = match[0];
            }
        }

        // 3. Policies & Operations (Enterprise Precision V4.4)
        const text = cleanText.toLowerCase();

        // 🔗 Logistics Strategy (Shipping/Delivery)
        if (!this.data.policies.shipping && (text.includes('shipping') || text.includes('delivery') || text.includes('ডেলিভারি'))) {
            const shipKeywords = ['shipping', 'delivery', 'ডেলিভারি', 'শিপিং', 'হ্যান্ডেলিং', 'পৌঁছে', 'চার্জ', 'ঢাকার'];
            this.data.policies.shipping = this.extractPolicySection($, shipKeywords);

            const matchIn = text.match(/(?:inside dhaka|ঢাকার ভেতর|ঢাকার ভেতরে).*?([০-৯\d]+)/i);
            if (matchIn) this.data.operations.deliveryChargeInside = this.extractNumber(matchIn[0]);

            const matchOut = text.match(/(?:outside dhaka|সারাদেশে|ঢাকার বাহিরে).*?([০-৯\d]+)/i);
            if (matchOut) this.data.operations.deliveryChargeOutside = this.extractNumber(matchOut[0]);
        }

        // 🛡️ Trust Framework (Return/Exchange)
        if (!this.data.policies.return && (text.includes('return') || text.includes('রিটার্ন') || text.includes('ফেরত') || text.includes('refund'))) {
            const returnKeywords = ['return', 'refund', 'exchange', 'রিটার্ন', 'ফেরত', 'পরিবর্তন', 'টাকা', 'ব্যাক'];
            this.data.policies.return = this.extractPolicySection($, returnKeywords);
        }

        // 4. Product Extraction (Heuristic + Schema)
        await this.extractProducts($, url);
    }

    cleanHtmlDescription(html) {
        if (!html) return "";
        // Decode common entities first
        let decoded = this.decodeEntities(html);

        // Convert some blocks to newlines for readability
        let text = decoded.replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n")
            .replace(/<\/li>/gi, "\n- ")
            .replace(/<li>/gi, "")
            .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "") // Remove internal scripts
            .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "")   // Remove internal styles
            .replace(/<iframe[^>]*>([\s\S]*?)<\/iframe>/gi, "") // Remove iframes
            .replace(/<noscript[^>]*>([\s\S]*?)<\/noscript>/gi, "") // Remove noscript
            .replace(/<form[^>]*>([\s\S]*?)<\/form>/gi, "")     // Remove forms (especially variation forms)
            .replace(/\{"attributes":[\s\S]*?\}/g, "")         // Strip raw JSON blobs
            .replace(/<[^>]*>?/gm, '');

        // Final entity cleanup and space normalization
        let clean = text.replace(/\n\s*\n/g, '\n').replace(/\s+/g, ' ').trim();

        // High Precision Fix: Strip Breadcrumb & UI Noise (Home / Category / Price / SKU prefixes)
        // Common pattern: "Home / পপুলার | Popular চালের গুড়া | Rice Flour 150৳ SKU: 102-RIC-PWD- Category: পপুলার | Popular"
        const noisePatterns = [
            /^Home\s*\/.*?\s*Popular\s*/i,
            /^Home\s*\/.*?\s*Category:.*?\s*/i,
            /Price:\s*৳?\s*[\d,.]+/gi,
            /SKU:\s*[A-Z\d-]+/gi,
            /Category:\s*.*?\s*$/i,
            /Add to Wishlist/gi,
            /Add to cart/gi,
            /Description\s+Additional\s+পণ্য বিবরণী:/i // Specific request fix
        ];

        noisePatterns.forEach(p => clean = clean.replace(p, ''));

        return clean.trim();
    }

    calculateImageScore($, imgEl, productName) {
        let score = 0;
        const src = imgEl.attr('src') || imgEl.attr('data-src') || "";
        const alt = (imgEl.attr('alt') || "").toLowerCase();

        // 1. Size heuristics (if available in attributes)
        const width = parseInt(imgEl.attr('width') || 0);
        const height = parseInt(imgEl.attr('height') || 0);
        if (width > 300 && height > 300) score += 50;

        // 2. Alt tag matches product name
        if (productName && alt.includes(productName.toLowerCase().split(' ')[0])) score += 40;

        // 3. Keyword scoring
        if (src.includes('/products/') || src.includes('/p/')) score += 30;
        if (src.includes('logo') || src.includes('banner')) score -= 100;

        return score;
    }

    getMainProductId($, url) {
        // 1. Check Body Class (WooCommerce Standard)
        const bodyClass = $('body').attr('class') || "";
        const idMatch = bodyClass.match(/postid-(\d+)/);
        if (idMatch) return idMatch[1];

        // 2. Check Hidden Input
        const hiddenId = $('input[name="product_id"]').first().val();
        if (hiddenId) return hiddenId;

        // 3. Fallback to first variations form if only one exists
        const forms = $('.variations_form');
        if (forms.length === 1) return forms.attr('data-product_id');

        return null;
    }

    getMainProductSlug(url) {
        try {
            const parts = url.split('?')[0].replace(/\/$/, "").split('/');
            return parts[parts.length - 1];
        } catch (e) { return ""; }
    }


    extractVariants($, context = null, sourceUrl = "") {
        const variants = [];
        const price_map = {};
        const scope = context || $('body');

        // V8.0: Context-Aware Selection
        const mainId = this.getMainProductId($, sourceUrl);
        const mainSlug = this.getMainProductSlug(sourceUrl);

        // 1. Dynamic Strategy A: Standard WooCommerce variations_form
        let variationsForm = null;
        const allForms = scope.find('.variations_form[data-product_variations]');

        if (allForms.length > 1 && (mainId || mainSlug)) {
            allForms.each((_, el) => {
                const $f = $(el);
                const formId = $f.attr('data-product_id');
                const formAction = $f.attr('action') || "";

                if (mainId && formId === mainId) {
                    variationsForm = $f;
                    return false;
                }
                if (mainSlug && formAction.includes(mainSlug)) {
                    variationsForm = $f;
                    return false;
                }
            });
        }

        if (!variationsForm) variationsForm = allForms.first();

        if (variationsForm && variationsForm.length > 0) {
            try {
                const rawAttr = variationsForm.attr('data-product_variations');
                const data = typeof rawAttr === 'string' ? JSON.parse(rawAttr) : rawAttr;

                if (Array.isArray(data)) {
                    data.forEach(v => {
                        // V7.3: Robust attribute extraction
                        const attrValues = Object.values(v.attributes || {}).filter(val => val !== "" && val !== null);
                        const attributes = attrValues.map(val => this.safeDecode(val)).join(' / ') || String(v.variation_id);

                        const reg = v.display_regular_price || v.regular_price || null;
                        const sale = v.display_price || v.price || null;
                        const finalPrice = sale || reg;

                        if (attributes && finalPrice) {
                            price_map[attributes] = this.toEngDigits(String(finalPrice));
                            variants.push({
                                type: "Variant",
                                value: attributes,
                                price: finalPrice,
                                regular_price: reg,
                                sale_price: sale,
                                sku: v.sku,
                                image_url: v.image ? v.image.src : null
                            });
                        }
                    });
                    if (variants.length > 0) return { variants, price_map };
                }
            } catch (e) {
                console.log("[Scraper] Error parsing variations JSON:", e.message);
            }
        }

        // 2. Dynamic Strategy B: Heuristic Swatch/Button Detection
        const swatchSelectors = [
            '.variable-item', '.swatch-item', '.ux-swatch', '.swatch',
            '.button-variable-item', '.variable-item:not(.disabled)',
            '.wvs-style-squared li', '.woo-variation-swatches li',
            '[data-value]', '[data-attribute_name]'
        ];

        let foundSwatches = scope.find(swatchSelectors.join(', '));
        if (foundSwatches.length > 0) {
            foundSwatches.each((_, el) => {
                const $el = $(el);
                const text = $el.text().trim() || $el.attr('data-value') || $el.attr('title');

                // Find label in proximity
                let type = "Option";
                const parentRow = $el.closest('tr, .row, .variations-line');
                if (parentRow.length > 0) {
                    type = parentRow.find('.label, label, .attribute-label').text().replace(/:/g, '').trim() || "Option";
                }

                if (text && text.length < 30 && !variants.some(v => v.value === text)) {
                    variants.push({
                        type: type,
                        value: text,
                        price: $el.attr('data-price') || null
                    });
                }
            });
            if (variants.length > 0) return { variants, price_map };
        }

        // 3. Dynamic Strategy C: Standard Select Dropdowns
        const standardSelectors = [
            'select[name*="option"]', 'select[id*="variant"]', 'select[name^="attribute_"]',
            '.variations select', '.product-variants select', 'select.size-selector'
        ];

        standardSelectors.forEach(s => {
            $(s, scope).each((_, el) => {
                const optScope = $(el);
                let label = optScope.attr('data-attribute_name') || optScope.attr('name') || "Option";
                if (label.includes('attribute_')) label = label.split('_').pop();
                label = this.safeDecode(label);

                optScope.find('option').each((i, opt) => {
                    const optText = $(opt).text().trim();
                    const optVal = $(opt).attr('value');
                    if (optText && !/select|choose/i.test(optText) && optVal) {
                        const price = $(opt).attr('data-price') || null;
                        if (price) price_map[optText] = this.toEngDigits(String(price));
                        if (!variants.some(v => v.value === optText)) {
                            variants.push({ type: label, value: optText, price: price });
                        }
                    }
                });
            });
        });

        return { variants, price_map };
    }



    // 2. High-Fidelity Meta Engine (OG/Twitter)
    async extractMetaInfo($, sourceUrl, isProductPage, shortDesc, longDesc, container) {
        if (isProductPage) {
            const metaName = $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content') || $('title').text().split('|')[0].split('-')[0].trim();
            const metaImg = $('meta[property="og:image:secure_url"]').attr('content') || $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content');

            let metaPrice = $('meta[property="product:price:amount"]').attr('content') ||
                $('meta[property="og:price:amount"]').attr('content');

            // V6.3: Support twitter:data1 if it's labeled as "price"
            const twitterData1 = $('meta[name="twitter:data1"]').attr('content');
            const twitterLabel1 = ($('meta[name="twitter:label1"]').attr('content') || "").toLowerCase();
            if (!metaPrice && twitterData1 && (twitterLabel1.includes('price') || twitterData1.includes('৳') || twitterData1.includes('Tk'))) {
                metaPrice = twitterData1;
            }

            const metaDesc = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content');

            if (metaName && (metaPrice || metaImg)) {
                const metaVariants = this.extractVariants($, container, sourceUrl);
                await this.addProduct(this.normalizeProduct({
                    name: metaName,
                    price: metaPrice || "",
                    full_description: longDesc || metaDesc || "",
                    description: shortDesc || "",
                    imageUrl: metaImg,
                    product_url: sourceUrl,
                    variants: metaVariants?.variants || [],
                    price_map: metaVariants?.price_map || {}
                }));
            }
        }
    }

    async extractProducts($, sourceUrl) {
        const pageTitle = $('title').text().toLowerCase();
        const ogType = $('meta[property="og:type"]').attr('content');
        const isProductPage = (ogType === 'product' || sourceUrl.includes('/product/') || sourceUrl.includes('/products/') || sourceUrl.includes('/p/'));

        // Anti-Category Filters
        const nonProductPatterns = ['/terms', '/privacy', '/news', '/blog', '/contact', '/about', '/policy', '/cart', '/checkout', '/my-account', '/collections/', '/category/', '/product-category/'];
        if (nonProductPatterns.some(p => sourceUrl.toLowerCase().includes(p)) && !isProductPage) return;

        // 1. Identify Main Product Container (Used for scoping variants and prices)
        const productContainers = [
            '.product-single', '.product-details', '.product-main',
            '.product-info', '.product-summary', '.entry-summary',
            '.product_wrapper', '.product-essential', '.product-shop'
        ];

        let container = null;
        for (const s of productContainers) {
            const el = $(s).first();
            if (el.length > 0) { container = el; break; }
        }
        if (!container && isProductPage) container = $('body');

        // 2. Clone body for clean description extraction
        const $cleanBody = $.load($.html());
        $cleanBody('script, style, iframe, noscript, form, button, .variations, .woocommerce-variation-add-to-cart, .zoomContainer').remove();

        const shortDescSelectors = [
            '.product-short-description', '.summary', '.woocommerce-product-details__short-description',
            '.short-description', '.product-excerpt', '.post-excerpt'
        ];

        const longDescSelectors = [
            '.product-description', '#description', '.description', '[itemprop="description"]',
            '.rte', '.woocommerce-tabs', '.product-tabs-content',
            '.entry-content', '.fusion-text', '#tab-description', '.product-info-main',
            '.product-details', '.additional-information', '#tab-additional_information',
            '.pro-detail', '.product-specs', '.specification-tabs', '.tab-content'
        ];

        const shortDescRaw = $cleanBody(shortDescSelectors.join(', ')).first().html();
        const longDescRaw = $cleanBody(longDescSelectors.join(', ')).not(shortDescSelectors.join(', ')).first().html() ||
            $cleanBody(longDescSelectors.join(', ')).first().html();

        const shortDesc = this.cleanHtmlDescription(shortDescRaw);
        const longDesc = this.cleanHtmlDescription(longDescRaw);

        // 3. Recursive JSON-LD Graph Engine (Deep Data)
        const ldJsonScripts = $('script[type="application/ld+json"]').toArray();
        for (const el of ldJsonScripts) {
            try {
                const json = JSON.parse($(el).html() || "");
                const items = json['@graph'] || (Array.isArray(json) ? json : [json]);

                for (const item of items) {
                    const type = item['@type'];
                    if (type === 'Product' || type === 'http://schema.org/Product') {
                        if (!item.name || item.name.toLowerCase().includes('category')) continue;

                        let variantData = this.extractVariants($, container, sourceUrl);
                        let variants = variantData ? variantData.variants : [];
                        let price_map = variantData ? variantData.price_map : {};

                        // 4. JSON-LD Offer Sync (Dynamic Mapping)
                        const offers = Array.isArray(item.offers) ? item.offers : (item.offers ? [item.offers] : []);
                        if (offers.length > 1 || variants.length === 0) {
                            for (const off of offers) {
                                if (off['@type'] === 'Offer' || off['@type'] === 'http://schema.org/Offer') {
                                    const vVal = off.name || off.sku || item.name;
                                    if (off.price) price_map[vVal] = this.toEngDigits(String(off.price));
                                    if (!variants.some(v => v.value === vVal)) {
                                        variants.push({
                                            type: "Option",
                                            value: vVal,
                                            price: off.price || off.lowPrice,
                                            sku: off.sku
                                        });
                                    }
                                }
                            }
                        }

                        // Deep Image Search in Schema
                        let img = item.image;
                        if (Array.isArray(img)) img = img[0];
                        if (typeof img === 'object') img = img.url || img.contentUrl || img.image;

                        const schemaPrice = item.offers?.price || item.offers?.[0]?.price || item.offers?.lowPrice || "";
                        let finalPrice = schemaPrice;

                        // V7.0: Robust SKU extraction if JSON-LD is missing it
                        let sku = item.sku || item.mpn || "";
                        if (!sku) {
                            sku = this.extractSKU($, container);
                        }

                        await this.addProduct(this.normalizeProduct({
                            name: item.name,
                            sku: sku,
                            price: finalPrice,
                            full_description: longDesc || item.description || "",
                            description: shortDesc || "",
                            imageUrl: img || $('meta[property="og:image"]').attr('content'),
                            product_url: item.url || sourceUrl,
                            variants: variants,
                            price_map: price_map
                        }));
                    }
                }
            } catch (e) { }
        }

        // 4. High-Fidelity Meta Engine (OG/Twitter)
        await this.extractMetaInfo($, sourceUrl, isProductPage, shortDesc, longDesc, container);

        // 5. Semantic Proximity Engine (DOM Fallback)
        if (container) {
            const cluster = this.extractPriceCluster($, container);
            if (cluster.price || cluster.sale_price) {
                const domSku = this.extractSKU($, container);
                const domVariants = this.extractVariants($, container, sourceUrl);
                await this.addProduct(this.normalizeProduct({
                    name: $('meta[property="og:title"]').attr('content') || $('title').text().split('|')[0].trim(),
                    sku: domSku,
                    price: cluster.price || cluster.sale_price,
                    regular_price: cluster.regular_price,
                    sale_price: cluster.sale_price,
                    full_description: longDesc,
                    description: shortDesc || "",
                    imageUrl: $('meta[property="og:image"]').attr('content'),
                    product_url: sourceUrl,
                    variants: domVariants?.variants || [],
                    price_map: domVariants?.price_map || {}
                }));
            }
        }
    }

    async addProduct(prod) {
        // v3: Data Enrichment Logic
        const prodUrl = prod.product_url ? prod.product_url.split('?')[0].replace(/\/$/, "") : "";
        const prodPriceNum = parseFloat(String(prod.price || "").replace(/[^0-9.]/g, ''));

        const existingIndex = this.data.products.findIndex(p => {
            const existingUrl = p.product_url ? p.product_url.split('?')[0].replace(/\/$/, "") : "";

            // V8.7 Enterprise Deduplication: URL is the primary key. 
            // Only fallback to name/price if NO URLs are available for either.
            if (prodUrl && existingUrl) {
                return prodUrl === existingUrl;
            }

            const existingPriceNum = parseFloat(String(p.price || "").replace(/[^0-9.]/g, ''));
            return (p.name === prod.name && Math.abs(existingPriceNum - prodPriceNum) < 1);
        });

        if (existingIndex !== -1) {
            const existing = this.data.products[existingIndex];

            // V4: Intelligent Data Reconciliation (Multi-Stream)
            const currentVariants = existing.variants ? JSON.parse(existing.variants) : { items: [] };
            const newVariants = prod.variants ? JSON.parse(prod.variants) : { items: [] };

            const finalRegular = (prod.regular_price && prod.regular_price.match(/\d/)) ? prod.regular_price : existing.regular_price;
            const finalSale = (prod.sale_price && prod.sale_price.match(/\d/)) ? prod.sale_price : existing.sale_price;

            // v6.3: Currency Symbol Protection (If new one has a symbol and current doesn't, it's richer)
            const hasExistingSymbol = /[৳$]|Tk|BDT/i.test(existing.price || "");
            const hasNewSymbol = /[৳$]|Tk|BDT/i.test(prod.price || "");

            const isNewRicher = (newVariants.items.length > currentVariants.items.length) ||
                (prod.full_description && (!existing.full_description || prod.full_description.length > (existing.full_description?.length || 0) * 1.1)) ||
                (prod.imageUrl && typeof prod.imageUrl === 'string' && prod.imageUrl.includes('http') && !existing.imageUrl) ||
                (prod.regular_price && !existing.regular_price) ||
                (hasNewSymbol && !hasExistingSymbol);

            if (isNewRicher) {
                // V7.3 Enterprise Persistence: Never downgrade variants
                // We compare the actual items length to pick the 'best' variant set
                const hasExistingVariants = currentVariants.items && currentVariants.items.length > 0;
                const hasNewVariants = newVariants.items && newVariants.items.length > 0;

                let finalVariantsObj = prod.variants; // Default to new
                if (hasExistingVariants && !hasNewVariants) {
                    finalVariantsObj = existing.variants;
                } else if (hasExistingVariants && hasNewVariants) {
                    // If both have variants, pick the one with more options
                    finalVariantsObj = (newVariants.items.length >= currentVariants.items.length) ? prod.variants : existing.variants;
                }

                this.data.products[existingIndex] = {
                    ...existing,
                    ...prod,
                    name: prod.name || existing.name,
                    sku: prod.sku || existing.sku,
                    price: prod.price || existing.price,
                    imageUrl: prod.imageUrl || existing.imageUrl,
                    variants: finalVariantsObj,
                    regular_price: finalRegular,
                    sale_price: finalSale,
                    full_description: (prod.full_description && prod.full_description.length > (existing.full_description?.length || 0)) ? prod.full_description : existing.full_description,
                    price_map: (Object.keys(newVariants.price_map || {}).length >= Object.keys(currentVariants.price_map || {}).length) ? (prod.price_map || existing.price_map) : existing.price_map
                };
            }
            return;
        }

        // Final sanity check for variants
        let finalVariants = prod.variants;
        if (typeof finalVariants === 'undefined') {
            finalVariants = JSON.stringify({ items: [], price_map: {}, sizes: [], colors: [] });
        }

        const v = JSON.parse(finalVariants);
        if (v.items && v.items.length > 0) {
            console.log(`[Scraper] 📦 Variation detected: ${prod.name} (${v.items.length} options)`);
        }

        this.data.products.push({
            ...prod,
            variants: finalVariants
        });

        if (this.onProductCallback) {
            await this.onProductCallback(this.data.products[this.data.products.length - 1]);
        }
    }

    discoverLinks($, currentUrl) {
        // v8.0 Density Check: Identify "Dense" product hubs (like Magento/Large E-com categories)
        const productHubSelectors = [
            '.product-item', '.item.product-item-info', '.product-image-container',
            '.products.grid', '.products.list', '.product-block', '.product-inner'
        ];
        const productDensity = productHubSelectors.reduce((acc, sel) => acc + $(sel).length, 0);

        $('a').each((_, el) => {
            const href = $(el).attr('href');
            if (!href || href.startsWith('javascript') || href.startsWith('#')) return;

            try {
                const urlObj = new URL(href, currentUrl);
                const fullUrl = this.normalizeUrl(urlObj.href);

                // Lock to domain
                if (urlObj.hostname !== this.domain && !urlObj.hostname.endsWith('.' + this.domain)) return;

                // Skip utility pages
                const skipPatterns = [
                    '/cart', '/checkout', '/my-account', '/login', '/logout', '/register', 'add-to-cart',
                    '/terms', '/privacy', '/news', '/blog', '/contact', '/about', '/policy', '/refund',
                    '/shipping', '/return', '/wishlist', '/compare', '/order-tracking'
                ];
                if (skipPatterns.some(p => fullUrl.includes(p))) return;

                // Skip binary/media files
                const mediaExtensions = [
                    '.mp4', '.mp3', '.wav', '.zip', '.pdf', '.jpg', '.jpeg', '.png', '.gif',
                    '.exe', '.dmg', '.pkg', '.apk', '.rar', '.7z'
                ];
                if (mediaExtensions.some(ext => fullUrl.toLowerCase().endsWith(ext))) return;

                if (this.visited.has(fullUrl) || this.queue.some(q => q.url === fullUrl)) return;

                const text = $(el).text().toLowerCase();
                let priority = 10;
                let type = 'general';

                // v8.0 Enterprise Selector Priority
                const isProductUrl = fullUrl.includes('/product/') || fullUrl.includes('/products/') || fullUrl.includes('/item/') || fullUrl.includes('/p/') || fullUrl.includes('/product-detail/');
                const isCategoryUrl = fullUrl.includes('/collections/') || fullUrl.includes('/category/') || fullUrl.includes('/catalogue/') || fullUrl.endsWith('.html');

                if (isProductUrl) {
                    priority = 100;
                    type = 'product';
                } else if (text.includes('product') || text.includes('shop') || text.includes('item')) {
                    priority = 90;
                    type = 'product';
                } else if (isCategoryUrl || productDensity > 5) {
                    // v8.0 If we are on a dense page, give high priority to all found links as they are likely sub-categories or products
                    priority = productDensity > 5 ? 70 : 50;
                    type = 'category';
                } else if (text.includes('shipping') || text.includes('delivery')) {
                    priority = 30;
                    type = 'shipping';
                } else if (text.includes('return') || text.includes('refund') || text.includes('policy')) {
                    priority = 25;
                    type = 'policy';
                } else if (text.includes('contact') || text.includes('about')) {
                    priority = 20;
                    type = 'contact';
                }

                this.queue.push({ url: fullUrl, priority, type });
            } catch (e) { }
        });
    }
}

module.exports = SmartScraper;
