const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const dbUtils = require('./db');
const crypto = require('crypto');
const BASELINE = require('./scraper-intelligence');
const scraperDriver = require('./scraper-driver');
const structuralAnalyzer = require('./structural-analyzer');

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
        this.isStreaming = false; // V14.0 Enterprise: Stateless Mode
        this.usePersistentFrontier = false; 
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
        this.useDynamic = false; // Flag to enable dynamic fallback
    }

    // V9.8 Enterprise Stability: Type-Safe JSON Handlers
    safeJsonParse(data, fallback = null) {
        if (!data) return fallback;
        if (typeof data === 'object') return data;
        if (typeof data === 'string' && (data.includes('[object Object]') || data.trim() === '')) return fallback;
        try {
            return JSON.parse(data);
        } catch (e) {
            return fallback;
        }
    }

    safeJsonStringify(data, fallback = "") {
        if (typeof data === 'string') {
            if (data.trim().startsWith('{') || data.trim().startsWith('[')) return data;
            // Prevent [object Object] serialization
            if (data.includes('[object Object]')) return fallback;
            return JSON.stringify({ items: [], text: data }); // Wrap plain strings
        }
        try {
            return JSON.stringify(data || fallback);
        } catch (e) {
            return fallback;
        }
    }

    normalizeUrl(urlStr) {
        try {
            const urlObj = new URL(urlStr);
            urlObj.hash = '';

            // Remove non-essential marketing/session/shopify-variant query parameters
            const noiseParams = [
                '_wpnonce', 'add_to_wishlist', 'add-to-cart', 'removed_item', 'wishlist_id',
                'fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign',
                'utm_term', 'utm_content', 'v', 'variant', '_pos', '_sid', '_ss', '_v', '_fid', '_ke'
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

    // V16.1: Shopify Analytics Meta Extraction (Enterprise Core)
    extractShopifyMeta($) {
        try {
            const scripts = $('script').toArray();
            for (const script of scripts) {
                const content = $(script).html() || "";
                
                // Strategy A: Direct ShopifyAnalytics.meta assignments
                if (content.includes('ShopifyAnalytics.meta')) {
                    const match = content.match(/var\s+meta\s*=\s*(\{.*?"variants"\s*:\s*\[.*?\]\s*\});/s);
                    if (match) {
                        const data = this.safeJsonParse(match[1]);
                        if (data?.product?.variants) {
                            const map = {};
                            data.product.variants.forEach(v => {
                                if (v.id) {
                                    map[String(v.id)] = {
                                        title: v.public_title || v.name || "",
                                        price: (v.price && v.price > 100000) ? (v.price / 100) : v.price, // Shopify meta prices can be in cents
                                        sku: v.sku || ""
                                    };
                                }
                            });
                            if (Object.keys(map).length > 0) return map;
                        }
                    }
                }

                // Strategy B: web-pixels-manager data (often very rich)
                if (content.includes('productVariants')) {
                    const match = content.match(/["']productVariants["']\s*:\s*(\[.*?\])/s);
                    if (match) {
                        const variants = this.safeJsonParse(match[1]);
                        if (Array.isArray(variants)) {
                            const map = {};
                            variants.forEach(v => {
                                if (v.id) {
                                    map[String(v.id)] = {
                                        title: v.title || v.untranslatedTitle || "",
                                        price: v.price?.amount || v.price,
                                        sku: v.sku || ""
                                    };
                                }
                            });
                            if (Object.keys(map).length > 0) return map;
                        }
                    }
                }

                // Strategy C: Specific tracking calls (like trekkie / track)
                if (content.includes('ShopifyAnalytics.lib.track')) {
                    const matches = content.matchAll(/"variantId":(\d+),.*?,"variant":"(.*?)"/g);
                    const map = {};
                    let found = false;
                    for (const m of matches) {
                        map[m[1]] = m[2].replace(/\\?\//g, '/').trim();
                        found = true;
                    }
                    if (found) return map;
                }
            }
        } catch (e) {
            console.log("[Scraper] Shopify Meta extraction failed:", e.message);
        }
        return null;
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

        // 3. Technical Table Search
        const tableRows = container.find('tr, li').filter((_, el) => {
            const text = $(el).text().toLowerCase();
            return (text.includes('sku') || text.includes('model') || text.includes('code')) && !text.includes('postal');
        });

        if (tableRows.length > 0) {
            const tableSku = tableRows.first().find('td, span, div').last().text().trim();
            if (tableSku && /^[A-Z0-9\d-]+$/i.test(tableSku) && tableSku.length > 3 && tableSku.length < 30 && !/select|choose/i.test(tableSku)) {
                return tableSku;
            }
        }

        // 4. Data Attributes
        const dataSku = container.attr('data-sku') || container.find('[data-sku]').first().attr('data-sku') || 
                        container.find('[data-product-sku]').first().attr('data-product-sku') || 
                        container.find('[data-variant-sku]').first().attr('data-variant-sku');
        if (dataSku && dataSku.length < 40) return dataSku;

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
        
        // V15.1: Aggressive SKU Extraction from Variants if root SKU is missing
        let rootSku = (prod.sku || "").trim();
        if (!rootSku && prod.variants) {
            const firstV = Array.isArray(prod.variants) ? prod.variants[0] : (prod.variants.items ? prod.variants.items[0] : null);
            if (firstV && firstV.sku) rootSku = firstV.sku;
        }
        normalized.sku = rootSku;

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

        // V9.7: Deal Intelligence - If sale price is same as regular, clear it to prevent redundant 'Offer' state
        if (normalized.regular_price && normalized.sale_price) {
            const regNum = parseFloat(normalized.regular_price.replace(/[^0-9.]/g, ''));
            const saleNum = parseFloat(normalized.sale_price.replace(/[^0-9.]/g, ''));
            if (!isNaN(regNum) && regNum === saleNum) {
                normalized.sale_price = "";
            }
        }

        // Logic: Main price is ALWAYS the sale price if available
        let finalP = String(normalized.sale_price || prod.price || "").trim();

        // V14.3: Hard Price Search Fallback (moved from here to extractProducts to remove $ dependency)
        // If finalP is still empty, it means no price was found from sale, prod.price, or priceData.price.
        // The meta price fallback should now be handled in extractProducts and passed in prod.price if found.

        if (finalP && !finalP.includes('৳') && !finalP.includes('Tk')) {
            finalP = `৳ ${finalP}`;
        }
        normalized.price = finalP;

        // V15.0: Strict Description Mapping Logic (No Fallbacks)
        normalized.description = String(prod.description || "").trim();
        normalized.full_description = String(prod.full_description || "").trim();

        // V15.0: Unified Technical Attributes Consolidation
        let techAttrs = [String(prod.technical_attributes || "").trim()].filter(Boolean);
        
        if (normalized.full_description) {
            const sections = normalized.full_description.split(/(?=##|\*\*|Materials:|Composition:|Wash Instruction:|Care Instruction:|\n[A-Z][a-z]+:)/);
            sections.forEach(s => {
                const lower = s.toLowerCase();
                if (lower.includes('material') || lower.includes('composition') || lower.includes('care') || lower.includes('wash')) {
                    const val = s.replace(/.*?materials?|composition|care|wash/i, '').replace(/^[:\s#\*]+/, '').trim();
                    if (val && !techAttrs.includes(val)) techAttrs.push(val);
                }
            });
        }
        
        normalized.technical_attributes = techAttrs.join(' | ');

        // V3: Structured Variants with Price Map
        let rawVariants = [];
        let priceMap = prod.price_map || {};

        if (prod.variants && typeof prod.variants === 'object' && !Array.isArray(prod.variants)) {
            rawVariants = prod.variants.variants || [];
            priceMap = prod.variants.price_map || priceMap;
        } else {
            rawVariants = Array.isArray(prod.variants) ? prod.variants : [];
        }

        const sizesArr = [];
        const colorsArr = [];
        const colorRegex = /Color|Colour|রঙ|ভেন্টোর/i;
        const sizeRegex = /Size|সাইজ|মাপ/i;
        
        // V17.1: Fix ReferenceError - Define minPrice and processedVariants
        let minPrice = Infinity;
        const processedVariants = [];

        rawVariants.forEach(v => {
            const lowerType = (v.type || "Option").toLowerCase();
            const val = String(v.value || "").trim();
            if (val) {
                // V18.0: Multi-Tier Validation (Dynamic Baseline Integration)
                const isAntiPattern = BASELINE.variants.antiPatterns.some(p => p.test(val));
                const isExactSku = val === (prod.sku || v.sku || "");
                
                if (isAntiPattern || isExactSku) {
                    // Reject known anti-patterns (SKUs, boilerplates) unless they match white-listed sizes
                    const isWhiteListedSize = BASELINE.variants.sizes.includes(val.toLowerCase());
                    if (!isWhiteListedSize) return; 
                }

                // Collect for processedVariants
                processedVariants.push(v);
                
                // Track minPrice for baseline normalization
                if (v.price) {
                    const p = parseFloat(String(v.price).replace(/[^0-9.]/g, ''));
                    if (!isNaN(p) && p < minPrice && p > 0) minPrice = p;
                }

                const checkVal = val.toLowerCase();
                if (colorRegex.test(lowerType) || BASELINE.variants.colors.includes(checkVal) || this.isColor(val)) {
                    if (!colorsArr.includes(val)) colorsArr.push(val);
                } else if (sizeRegex.test(lowerType) || BASELINE.variants.sizes.includes(checkVal) || this.isSize(val)) {
                    if (!sizesArr.includes(val)) sizesArr.push(val);
                } else {
                    // Smart fallback for untyped variants (replaces legacy 15-char rule)
                    if (this.isColor(val)) {
                       if (!colorsArr.includes(val)) colorsArr.push(val);
                    } else if (this.isSize(val) || (val.length < 10 && !/^[A-Z\d-]{5,}$/.test(val))) {
                       if (!sizesArr.includes(val)) sizesArr.push(val);
                    }
                }
            }
        });

        normalized.variants = this.safeJsonStringify({
            items: processedVariants,
            price_map: priceMap,
            sizes: sizesArr,
            colors: colorsArr
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
        let text = el.text().replace(/\s+/g, ' ').trim();
        return this.cleanText(text);
    }

    /**
     * V15.0: Intelligent Semantic Mapping
     * Consolidates all product attributes strictly into technical_attributes.
     */
    intelligentSemanticMapping(prod, html, details) {
        let techAttrs = [String(prod.technical_attributes || "").trim()].filter(Boolean);

        // Heuristic 1: Food products
        if (html.match(/Ingredients|উপাদানসমূহ|Nutrition|পুষ্টিগুণ/i)) {
            const ingMatch = html.match(/(?:Ingredients|উপাদানসমূহ):\s*([^<\n]+)/i);
            if (ingMatch) techAttrs.push(`Ingredients: ${ingMatch[1].trim()}`);

            const storeMatch = html.match(/(?:Storage|সংরক্ষণ):\s*([^<\n]+)/i);
            if (storeMatch) techAttrs.push(`Storage: ${storeMatch[1].trim()}`);
        }

        // Heuristic 2: General fallback keywords
        const sourceHtml = html || prod.full_description || prod.description || "";

        const materials = this.extractMaterialsFromHtml(sourceHtml);
        if (materials && !techAttrs.some(a => a.includes(materials))) techAttrs.push(`Materials: ${materials}`);

        const wash = this.extractWashFromHtml(sourceHtml);
        if (wash && !techAttrs.some(a => a.includes(wash))) techAttrs.push(`Care: ${wash}`);

        const attrs = this.extractTechnicalAttributesFromHtml(sourceHtml);
        if (attrs && !techAttrs.some(a => a.includes(attrs))) techAttrs.push(attrs);

        // V14.2/V15.0: Structured nextData support (Sailor style)
        if (details) {
            if (details.composition && !techAttrs.some(a => a.includes(details.composition))) techAttrs.push(`Composition: ${details.composition}`);
            if (details.fabrication && !techAttrs.some(a => a.includes(details.fabrication))) techAttrs.push(`Fabrication: ${details.fabrication}`);
            if (details.care || details.care_level || details.handling) {
                const care = details.care || details.care_level || details.handling;
                if (!techAttrs.some(a => a.includes(care))) techAttrs.push(`Care: ${care}`);
            }
            if (details.fit && !techAttrs.some(a => a.includes(details.fit))) techAttrs.push(`Fit: ${details.fit}`);
            if (details.segment && !techAttrs.some(a => a.includes(details.segment))) techAttrs.push(`Segment: ${details.segment}`);
            if (details.embellishment && !techAttrs.some(a => a.includes(details.embellishment))) techAttrs.push(`Embellishment: ${details.embellishment}`);
        }

        return { technical_attributes: techAttrs.join(' | ') };
    }

    isColor(val) {
        if (!val) return false;
        const colors = ['red', 'blue', 'green', 'black', 'white', 'yellow', 'brown', 'pink', 'purple', 'grey', 'gray', 'orange', 'silver', 'gold', 'beige', 'navy', 'maroon', 'teal', 'cyan', 'magenta', 'lime', 'olive', 'indigo', 'violet', 'charcoal', 'ivory', 'khaki', 'tan', 'teal', 'লাল', 'নীল', 'সবুজ', 'কালো', 'সাদা', 'হলুদ', 'বাদামী', 'গোলাপী', 'বেগুনি', 'ধুসর', 'অরেঞ্জ'];
        return colors.some(c => val.toLowerCase().includes(c));
    }

    isSize(val) {
        if (!val) return false;
        const sizes = ['s', 'm', 'l', 'xl', 'xxl', 'xxxl', '2xl', '3xl', '4xl', '5xl', 'xs', 'small', 'medium', 'large', 'extra large', 'সাইজ', 'স্মল', 'লার্জ', 'মিডিয়াম'];
        const numPatt = /^\d+(\.\d+)?\s*(cm|mm|inch|in|ft|m|kg|gm|ml|l| টি| পিস)?$/i;
        return sizes.includes(val.toLowerCase()) || numPatt.test(val);
    }


    async scan(startUrl, options = { strictSinglePage: false, isApiSync: true, maxPages: 0, onProduct: null, isStreaming: false, persistentFrontier: false }, onUpdate = null) {
        this.onProductCallback = options.onProduct;
        this.isStreaming = options.isStreaming || false;
        this.usePersistentFrontier = options.persistentFrontier || false;

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
            let consecutiveStalePages = 0; // V17.3: Early Exit for pagination branches
            const STALE_LIMIT = 4; // Abort after 4 pages with no NEW products

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

                // Enterprise Frontier Check
                if (this.usePersistentFrontier && this.processId) {
                    const status = await dbUtils.checkFrontier(this.processId, normalized);
                    if (status === 'visited') continue;
                    await dbUtils.addToFrontier(this.processId, normalized, 'visited');
                } else {
                    if (this.visited.has(normalized)) continue;
                    this.visited.add(normalized);
                }

                pagesProcessed++;

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
                    await this.processPage($, url, type, consecutiveStalePages);
                    this.data.visitedUrls.push(url);

                    const afterCount = this.data.products.length;
                    const afterQueueSize = this.queue.length;

                    // v8.2.1: Activity Detection (Product found OR New Links discovered)
                    const activityDetected = (afterCount > beforeCount) || (afterQueueSize > beforeQueueSize);

                    // V17.3: Precision Stale Limit for Pagination
                    if (type === 'pagination' || type === 'category') {
                        if (afterCount > beforeCount) {
                            consecutiveStalePages = 0; // Reset on success
                        } else {
                            consecutiveStalePages++;
                            if (consecutiveStalePages >= STALE_LIMIT) {
                                log(`⚠️ Discovery Alert: No NEW unique products found in ${consecutiveStalePages} consecutive pages. Aborting [${type.toUpperCase()}] branch.`, 'warning');
                                // We don't 'break' the whole loop, we just don't queue more pagination for this branch?
                                // Actually, since we shift from queue, we simply skip adding next pages in discoverPagination
                            }
                        }
                    }

                    if (activityDetected || type === 'sitemap') {
                        lastProductAddedAt = pagesProcessed; // Heartbeat: Reset stagnation

                        if (afterCount > currentLimit * 0.4 && currentLimit < 10000 && !options.strictSinglePage) {
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
                if (this.queue.length === 0 && this.failedBacklog.length > 0 && (this.usePersistentFrontier || this.visited.size < currentLimit)) {
                    onUpdate({ message: `🔄 Initiating Self-Correction Pass on ${this.failedBacklog.length} failed pages...`, type: 'info' });
                    const toRetry = this.failedBacklog.splice(0, 10); // Batch retry
                    for (const item of toRetry) {
                        const norm = this.normalizeUrl(item.url);
                        this.visited.delete(norm);
                        if (this.usePersistentFrontier && this.processId) {
                            // Reset status to allow re-visit in database
                            await dbUtils.addToFrontier(this.processId, norm, 'pending').catch(() => {});
                        }
                        this.queue.push({ ...item, priority: 50, retryPass: true });
                    }
                }

                // Prevent event loop block and allow GC pulse
                // V16.0 Dynamic Braking System (Adaptive Delay)
                let adaptiveDelay = 100;
                if (options.dynamicThrottling) {
                    const currentRss = process.memoryUsage().rss / 1024 / 1024;
                    const limit = parseInt(process.env.MAX_SCRAPER_RAM_MB) || 1500;
                    const usageRatio = currentRss / limit;

                    if (usageRatio > 0.9) {
                        adaptiveDelay = 2000; // 🛑 Heavy Brake: 2s delay
                        if (pagesProcessed % 5 === 0) log(`[Brake] 🔴 Critical RAM (${Math.round(currentRss)}MB). Throttling: 2s delay.`, 'warning');
                    } else if (usageRatio > 0.75) {
                        adaptiveDelay = 800;  // ⚠️ Soft Brake: 800ms delay
                        if (pagesProcessed % 10 === 0) log(`[Brake] 🟡 High RAM (${Math.round(currentRss)}MB). Throttling: 800ms delay.`, 'info');
                    } else if (usageRatio > 0.5) {
                        adaptiveDelay = 300;  // 🐢 Caution: 300ms delay
                    }
                }
                await new Promise(resolve => setTimeout(resolve, adaptiveDelay));

                // Production Memory Heartbeat: Trigger GC if available after long sessions
                if (pagesProcessed % 50 === 0 && global.gc) {
                    console.log(`[Scraper] 💓 Memory Heartbeat: Triggering Garbage Collection...`);
                    global.gc();
                }

                // v14.0 Enterprise Guard: Cycle 'visited' set if it grows beyond extreme limits (e.g. 5k entries)
                // This prevents the Set from becoming a memory leak in massive recursive crawls.
                if (this.visited.size > 5000) {
                    console.log(`[Scraper] 🛡️ Queue Guard: visited set reaching threshold. Pruning...`);
                    // We keep only the last 1000 to maintain some deduplication without bloating RAM
                    const lastVisited = Array.from(this.visited).slice(-1000);
                    this.visited = new Set(lastVisited);
                }
            }

            if (this.queue.length === 0) stopReason = "Queue Exhausted";
            log(`✅ Scan Complete. Reason: ${stopReason}. Extracted ${this.data.products.length} Products.`, 'success');
            
            // Clean up browser resources
            await scraperDriver.close();
            
            this.healthReport.endTime = new Date();
            this.generateHealthReport();
            return this.data;
        } catch (error) {
            log(`❌ Scraper Error: ${error.message}`, 'error');
            await scraperDriver.close();
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

                        // Intelligent Type Mapping: Skip generic "Title" or "Option" if real names exist
                        let typeName = "Variant";
                        if (p.options && p.options[0]) {
                            const rawName = p.options[0].name;
                            const isGeneric = BASELINE.variants.antiPatterns.some(ap => ap.test(rawName));
                            typeName = isGeneric ? "Variant" : rawName;
                        }

                        return {
                            type: typeName,
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

                    const bodyHtml = p.body_html || "";
                    const semanticData = this.intelligentSemanticMapping({}, bodyHtml, null);

                    await this.addProduct(this.normalizeProduct({
                        name: p.title,
                        price: p.variants && p.variants[0] ? p.variants[0].price : "",
                        regular_price: p.variants && p.variants[0] ? p.variants[0].compare_at_price : "",
                        sale_price: p.variants && p.variants[0] ? p.variants[0].price : "",
                        full_description: bodyHtml ? this.cleanHtmlDescription(bodyHtml) : "",
                        description: "",
                        imageUrl: mainImg,
                        product_url: url.split('?')[0],
                        sku: p.variants && p.variants[0] ? p.variants[0].sku : "",
                        variants: variants,
                        price_map: price_map,
                        composition: semanticData.composition,
                        handling_guidelines: semanticData.handling_guidelines,
                        technical_attributes: semanticData.technical_attributes
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

                    const bodyHtml = p.body_html || "";
                    const semanticData = this.intelligentSemanticMapping({}, bodyHtml, null);

                    await this.addProduct(this.normalizeProduct({
                        name: p.title,
                        price: p.variants && p.variants[0] ? p.variants[0].price : "",
                        regular_price: p.variants && p.variants[0] ? p.variants[0].compare_at_price : "",
                        sale_price: p.variants && p.variants[0] ? p.variants[0].price : "",
                        full_description: bodyHtml ? this.cleanHtmlDescription(bodyHtml) : "",
                        description: "",
                        imageUrl: p.images && p.images[0] ? p.images[0].src : "",
                        product_url: new URL(`/products/${p.handle}`, this.baseUrl).href,
                        sku: p.variants && p.variants[0] ? p.variants[0].sku : "",
                        variants: variants,
                        price_map: price_map,
                        composition: semanticData.composition,
                        handling_guidelines: semanticData.handling_guidelines,
                        technical_attributes: semanticData.technical_attributes
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
                timeout: 20000, 
                validateStatus: s => s === 200 || s === 304
            });

            if (response.status === 304) {
                console.log(`[Scraper] ⚡ Skipped (Not Modified): ${url}`);
                return "NOT_MODIFIED";
            }

            const html = response.data;
            
            // v21.0: Structural Check for JS-Heavy Pages
            // If the page is very small or contains "Loading..." markers but no real content, switch to dynamic
            const $ = cheerio.load(html);
            const bodyLength = $('body').text().length;
            const hasSkeletons = html.includes('loading...') || html.includes('skeleton') || html.includes('dynamic-content');
            
            // If it's a product page but we have very little text, or a specific platform known for JS rendering
            const isProduct = url.includes('/product/') || url.includes('/products/');
            
            if (isProduct && (bodyLength < 500 || hasSkeletons)) {
                console.log(`[Scraper] 🔄 Low Content Detected (${bodyLength} chars). Switching to Dynamic Mode for: ${url}`);
                return await scraperDriver.fetchDynamicPage(url);
            }

            return html;
        } catch (error) {
            const isConnReset = error.code === 'ECONNRESET' || error.message.includes('disconnected');
            const isTimeout = error.code === 'ECONNABORTED' || error.message.includes('timeout');

            if ((isConnReset || isTimeout) && retryCount < maxRetries) {
                console.log(`[Scraper] 🔄 Retrying ${url} (${retryCount + 1}/${maxRetries}) due to ${error.code || 'timeout'}...`);
                await new Promise(r => setTimeout(r, 2000 * (retryCount + 1))); 
                return this.fetchPage(url, retryCount + 1, lastScraped);
            }

            // Fallback for 403/Blocked - try dynamic once
            if (error.response && (error.response.status === 403 || error.response.status === 401)) {
                console.log(`[Scraper] 🛡️ Access Denied (403). Attempting Dynamic Bypass for: ${url}`);
                return await scraperDriver.fetchDynamicPage(url);
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

    async processPage($, url, type, consecutiveStalePages = 0) {
        // v8.2: Unified processing and discovery entry point
        // Only extract product/brand info for HTML pages, not XML sitemaps
        if (type !== 'sitemap') {
            await this.extractInfo($, url, type);
        }

        // Discovery logic (Skip if specific type)
        if (type !== 'product') {
            await this.discoverSitemaps($, url);
            await this.discoverLinks($, url);
            await this.discoverPagination($, url, consecutiveStalePages);
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

    async discoverPagination($, currentUrl, consecutiveStalePages = 0) {
        // V17.3 Early Exit: If this branch is stale, don't look for more pages
        if (consecutiveStalePages >= 4) return;

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
                    text.includes('load more') ||
                    text.includes('আরও') ||
                    text === '>' ||
                    text === '»' ||
                    (text.match(/^\d+$/) && parseInt(text) > 1) // Digits can be page numbers
                )) {
                    // If it's just a number, it's a page link, lower priority but still useful
                    const priority = text.match(/^\d+$/) ? 90 : 95;
                    this.queuePagination(href, currentUrl, priority);
                    foundNext = true;
                }
            });
        }

        // V17.2: Next.js Discovery on Category Pages
        if (!foundNext && currentUrl.includes('category') || currentUrl.includes('collections')) {
            const nextData = this.extractNextData($);
            if (nextData && nextData.pageProps && nextData.pageProps.products && nextData.pageProps.products.next_page_url) {
                this.queuePagination(nextData.pageProps.products.next_page_url, currentUrl, 98);
            }
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

        return this.data.products.length > 0 ? this.data.products[0] : null;
    }

    cleanHtmlDescription(html) {
        if (!html) return "";
        // Decode common entities first
        let decoded = this.decodeEntities(html);

        // Convert some blocks to newlines for readability
        let text = decoded.replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n")
            .replace(/<\/td>/gi, " ") // Treat table cells as space-separated
            .replace(/<\/tr>/gi, "\n") // Treat table rows as newline-separated
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
        let clean = text.replace(/\n\s*\n/g, '\n').replace(/ +/g, ' ').trim();

        // High Precision Fix: Strip Breadcrumb & UI Noise (Home / Category / Price / SKU prefixes)
        const noisePatterns = [
            /^Home\s*\/.*?\s*Popular\s*/i,
            /^Home\s*\/.*?\s*Category:.*?\s*/i,
            /Price:\s*৳?\s*[\d,.]+/gi,
            /SKU:\s*[A-Z\d-]+/gi,
            /Category:\s*.*?\s*$/i,
            /Add to Wishlist/gi,
            /Add to cart/gi,
            /Description\s+Additional\s+পণ্য বিবরণী:/i,
            /Bag\s*Bag/gi // Specific noise found in Turaag
        ];

        noisePatterns.forEach(p => clean = clean.replace(p, ''));
        
        // V17.5: Dynamic Baseline Noise Filtering
        BASELINE.noise.product.forEach(p => clean = clean.replace(p, ''));

        return clean.trim();
    }

    extractMaterialsFromDetails(details) {
        if (!details) return "";
        const parts = [];
        if (details.composition && details.composition.data && Array.isArray(details.composition.data)) {
            details.composition.data.forEach(c => {
                if (c.name) parts.push(c.name);
            });
        }
        if (details.fabrication) parts.push(details.fabrication);
        return parts.join(', ');
    }

    extractMaterialsFromHtml(html) {
        if (!html) return "";
        // V12.2: Tag-Aware Sectioning - Skips tags (like </h2>) immediately after the keyword
        const headerMatch = html.match(/[#\s]*(?:Materials?|Fabrication|Composition|Fabric|পণ্য উপাদান)(?:[:\s#\n-]+|<\/?[^>]+>)+/i);
        if (headerMatch) {
            const startIdx = headerMatch.index + headerMatch[0].length;
            const remaining = html.substring(startIdx);
            // End markers: Next header, next summary, next ## header, or end of a details block
            const endMatch = remaining.match(/(?:<h[1-6]|<summary[^>]*>|##|Care Instruction|Wash Instruction|Features|Technical|<\/details>)/i);
            const content = endMatch ? remaining.substring(0, endMatch.index) : remaining;
            const clean = content.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
            if (clean && clean.length > 2) return clean;
        }

        // Fallback: Keyword search
        const fallback = html.match(/(?:92%|95%|100%|Cotton|Jersey|Linen|Viscose|Polyester|Denim|Canvas)[^<\n.]*/i);
        return fallback ? fallback[0].trim() : "";
    }

    extractWashFromHtml(html) {
        if (!html) return "";
        // V12.2: Tag-Aware Sectioning
        const headerMatch = html.match(/[#\s]*(?:Wash Instructions?|Care Instructions?|Handling Guidelines?|Care Level|ধৌত করার নির্দেশাবলী|ধোয়ার নিয়ম)(?:[:\s#\n-]+|<\/?[^>]+>)+/i);
        if (headerMatch) {
            const startIdx = headerMatch.index + headerMatch[0].length;
            const remaining = html.substring(startIdx);
            const endMatch = remaining.match(/(?:<h[1-6]|<summary[^>]*>|##|Materials|Fabrication|Features|Technical|<\/details>)/i);
            const content = endMatch ? remaining.substring(0, endMatch.index) : remaining;
            const clean = content.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
            if (clean && clean.length > 2) return clean;
        }

        // Fallback: Standard phrases
        const fallback = html.match(/(?:Hand wash|Machine wash|Dry clean|Cool iron|Do not bleach|Wash separately|Wash in)[^<\n.]*/i);
        return fallback ? fallback[0].trim() : "";
    }

    extractTechnicalAttributesFromHtml(html) {
        if (!html) return "";
        // V12.0: Heuristic for bullet points and specifications
        const attributes = [];

        // 1. Look for explicit header
        const headerMatch = html.match(/[#\s]*(?:Technical Attributes|Features|Specifications|বৈশিষ্ট্যসমূহ)[:\s#\n-]+/i);
        if (headerMatch) {
            const startIdx = headerMatch.index + headerMatch[0].length;
            const remaining = html.substring(startIdx);
            const endMatch = remaining.match(/(?:<h[1-6]|<details|<summary|##|Materials|Wash Instruction)/i);
            const content = endMatch ? remaining.substring(0, endMatch.index) : remaining;
            const listItems = content.match(/<li>(.*?)<\/li>/gi);
            if (listItems) {
                listItems.forEach(item => attributes.push(item.replace(/<[^>]*>?/gm, '').trim()));
            } else {
                const plainText = content.replace(/<[^>]*>?/gm, '').split('\n');
                plainText.forEach(line => {
                    const l = line.trim();
                    if (l && l.length > 5) attributes.push(l);
                });
            }
        }

        // 2. Fallback: Generic bullet point extraction if no header found
        if (attributes.length === 0) {
            const listMatch = html.match(/<li>(.*?)<\/li>/gi);
            if (listMatch) {
                listMatch.slice(0, 5).forEach(m => attributes.push(m.replace(/<[^>]*>?/gm, '').trim()));
            }
        }

        return attributes.filter(a => a.length > 0).join(' | ');
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


    extractName($, container) {
        const h1 = (container && container.length > 0 ? container.find('h1') : $('h1')).first().text().trim();
        if (h1) return h1;
        const ogTitle = $('meta[property="og:title"]').attr('content');
        if (ogTitle) return ogTitle.split('|')[0].trim();
        return $('title').text().split('|')[0].split('-')[0].trim() || "Product";
    }

    extractImage($, container) {
        if (!container || container.length === 0) return "";
        let bestImg = "";
        let maxScore = -100;

        container.find('img').each((i, el) => {
            const $img = $(el);
            const score = this.calculateImageScore($, $img, "");
            if (score > maxScore) {
                maxScore = score;
                bestImg = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src') || "";
            }
        });

        return this.cleanImageUrl(bestImg) || $('meta[property="og:image"]').attr('content') || "";
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
            const parts = url.split('/');
            return parts[parts.length - 1] || parts[parts.length - 2];
        } catch (e) { return ""; }
    }

    cleanProductName(name) {
        if (!name) return "";
        let clean = name.trim();
        // V17.5: Dynamic Baseline Noise Filtering
        BASELINE.noise.product.forEach(p => clean = clean.replace(p, ''));
        return clean.replace(/\s+/g, ' ').trim();
    }

    /**
     * V9.6: Next.js __NEXT_DATA__ Engine
     * Extracts high-fidelity product data from internal Next.js state
     */
    extractNextData($) {
        try {
            const nextDataScript = $('script#__NEXT_DATA__').html();
            if (!nextDataScript) return null;
            const data = JSON.parse(nextDataScript);
            // Sailor and many Next.js e-commerce sites store details here
            // For Sailor, fabrication, care_level, fit, segment, composition are available in details
            const details = data.props?.pageProps?.details || data.props?.pageProps?.product || null;
            if (!details) return null;

            // v14.2: Enriched detail extraction
            return {
                ...details,
                composition: details.composition?.data?.map(c => c.name).join(', ') || details.composition || "",
                fabrication: details.fabrication || "",
                care: details.care_instruction || details.care_level || "",
                fit: details.fit || ""
            };
        } catch (e) {
            console.log("[Scraper] Error parsing __NEXT_DATA__:", e.message);
            return null;
        }
    }

    extractVariants($, context = null, sourceUrl = "") {
        const variants = [];
        const price_map = {};
        const scope = context || $('body');
        
        // V16.0: Shopify Specific Mapping (ID to Data)
        const shopifyMap = this.extractShopifyMeta($);
        if (shopifyMap) {
            console.log(`[Scraper] Found Shopify Meta Mapping with ${Object.keys(shopifyMap).length} entries`);
            
            // If Shopify Meta is found, we can pre-populate variants with high precision
            Object.values(shopifyMap).forEach(v => {
                if (v.title && !variants.some(existing => existing.value === v.title)) {
                    const cleanTitle = v.title.replace(/[-_]/g, ' ').trim();
                    if (v.price) price_map[cleanTitle] = this.toEngDigits(String(v.price));
                    variants.push({
                        type: "Variant",
                        value: cleanTitle,
                        price: v.price,
                        sku: v.sku
                    });
                }
            });
        }

        // Context-Aware Selection
        const mainId = this.getMainProductId($, sourceUrl);
        const mainSlug = this.getMainProductSlug(sourceUrl);

        // 0. V9.6 Strategy: Next.js Data Source (Highest Fidelity for platforms like Sailor)
        const nextData = this.extractNextData($);
        if (nextData && Array.isArray(nextData.variant)) {
            nextData.variant.forEach(v => {
                const attributes = v.variant || v.name || v.sku;
                const regPrice = v.base_price || v.price;
                const salePrice = (v.base_discounted_price && v.base_discounted_price !== v.base_price) ? v.base_discounted_price : "";
                const price = salePrice || regPrice;

                if (attributes && price) {
                    const cleanAttr = attributes.replace(/[-_]/g, ' ');
                    price_map[cleanAttr] = this.toEngDigits(String(price));
                    variants.push({
                        type: "Variant",
                        value: cleanAttr,
                        price: price,
                        regular_price: regPrice,
                        sale_price: salePrice,
                        sku: v.barcode || v.sku,
                        image_url: v.image || null,
                        stock: v.stock !== undefined ? v.stock : null
                    });
                }
            });
        }

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
                            if (!variants.some(varItem => varItem.value === attributes)) {
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
                        }
                    });
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
            'label[for*="option"]', 'input[type="radio"] + label',
            'input[name*="option"]', 'input[name*="attribute"]', // Added more direct input selectors
            '[data-value]', '[data-attribute_name]'
        ];

        let foundSwatches = scope.find(swatchSelectors.join(', '));
        console.log(`[Scraper Debug] Found swatches: ${foundSwatches.length}`);
        if (foundSwatches.length > 0) {
            foundSwatches.each((_, el) => {
                const $el = $(el);
                const text = ($el.text().trim() || $el.attr('data-value') || $el.val() || $el.attr('title') || "").trim();

                // Find label in proximity
                let type = "Option";
                const parentRow = $el.closest('tr, .row, .variations-line');
                if (parentRow.length > 0) {
                    type = parentRow.find('.label, label, .attribute-label').text().replace(/:/g, '').trim() || "Option";
                }

                // V15.1: Enhanced SKU Exclusion Logic for Variant Values
                const isCodeLike = /^[A-Z0-9-]{6,20}$/.test(text); // Check if text looks like a SKU/ID
                const hasLabel = variants.some(v => v.value === text);
                
                if (text && text.length < 40 && !hasLabel && !isCodeLike) {
                    variants.push({
                        type: type,
                        value: text,
                        price: $el.attr('data-price') || null
                    });
                }
            });
        }

        // 2.5 Dynamic Strategy D: Shopify Advanced (Radios/Fieldsets)
        const shopifySelectors = [
            'variant-radios', 'fieldset.js-variant-picker', '.product-form__input',
            '.variant-wrapper', '.swatch-attribute', 'fieldset[class*="variant"]'
        ];
        
        scope.find(shopifySelectors.join(', ')).each((_, el) => {
            const $container = $(el);
            let type = $container.find('legend, .form__label, .swatch-attribute-label').first().text().replace(/:/g, '').trim() || "Option";
            
            $container.find('input[type="radio"], input[type="checkbox"], label, .swatch-element').each((i, sub) => {
                const $sub = $(sub);
                let val = "";

                if ($sub.is('input')) {
                    val = $sub.val();
                } else {
                    val = $sub.text().trim() || $sub.attr('data-value');
                }

                // If val is a number (Shopify variant ID), try to map it using meta
                if (val && /^\d+$/.test(val) && shopifyMap && shopifyMap[val]) {
                    val = shopifyMap[val];
                }

                if (val && val.length < 50 && !/select|choose/i.test(val)) {
                    if (!variants.some(v => v.value === val)) {
                        variants.push({ type, value: val });
                    }
                }
            });
        });

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
                        let finalValue = optText;
                        
                        // Shopify fallback: Use metadata mapping for name="id" or similar Select IDs
                        if (shopifyMap && shopifyMap[optVal] && (optText.includes(optVal) || /Variant \d+/.test(optText) || optText === optVal)) {
                            finalValue = shopifyMap[optVal];
                        }

                        const price = $(opt).attr('data-price') || null;
                        if (price) price_map[finalValue] = this.toEngDigits(String(price));
                        if (!variants.some(v => v.value === finalValue)) {
                            variants.push({ type: label, value: finalValue, price: price });
                        }
                    }
                });
            });
        });

        return { variants, price_map };
    }



    // 2. High-Fidelity Meta Engine (OG/Twitter)
    extractMetaInfo($, sourceUrl, isProductPage, shortDesc, longDesc, container) {
        if (isProductPage) {
            const metaName = $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content') || $('title').text().split('|')[0].split('-')[0].trim();
            const metaImg = $('meta[property="og:image:secure_url"]').attr('content') || $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content');

            let metaPrice = $('meta[property="product:price:amount"]').attr('content') ||
                $('meta[property="og:price:amount"]').attr('content');

            const twitterData1 = $('meta[name="twitter:data1"]').attr('content');
            const twitterLabel1 = ($('meta[name="twitter:label1"]').attr('content') || "").toLowerCase();
            if (!metaPrice && twitterData1 && (twitterLabel1.includes('price') || twitterData1.includes('৳') || twitterData1.includes('Tk'))) {
                metaPrice = twitterData1;
            }

            const metaDesc = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content');

            if (metaName && (metaPrice || metaImg)) {
                const metaVariants = this.extractVariants($, container, sourceUrl);
                return {
                    name: metaName,
                    price: metaPrice || "",
                    full_description: longDesc || metaDesc || "",
                    description: shortDesc || "",
                    imageUrl: metaImg,
                    product_url: sourceUrl,
                    variants: metaVariants?.variants || [],
                    price_map: metaVariants?.price_map || {}
                };
            }
        }
        return null;
    }

    async extractProducts($, sourceUrl) {
        const pageTitle = $('title').text().toLowerCase();
        const ogType = $('meta[property="og:type"]').attr('content');

        // V17.0: Enterprise Non-Product URL Shield
        const nonProductUrlPatterns = ['/category/', '/product-category/', '/collections/', '/cart', '/checkout', '/my-account', '/terms', '/privacy', '/news', '/blog', '/contact', '/about', '/policy', '/store-locator', '/page/'];
        const urlLower = sourceUrl.toLowerCase();
        if (nonProductUrlPatterns.some(p => urlLower.includes(p))) return;

        const isProductPage = (ogType === 'product' || sourceUrl.includes('/product/') || sourceUrl.includes('/products/') || sourceUrl.includes('/p/') || sourceUrl.includes('/details/'));

        // Waterfall State
        const finalProd = {
            product_url: sourceUrl,
            name: "",
            sku: "",
            price: "",
            regular_price: "",
            sale_price: "",
            description: "",
            full_description: "",
            imageUrl: "",
            variants: [],
            price_map: {},
            technical_attributes: ""
        };

        const patch = (source) => {
            if (!source) return;
            if (!finalProd.name && source.name) finalProd.name = source.name;
            if (!finalProd.sku && source.sku) finalProd.sku = source.sku;
            if (!finalProd.price && source.price) finalProd.price = source.price;
            if (!finalProd.regular_price && source.regular_price) finalProd.regular_price = source.regular_price;
            if (!finalProd.sale_price && source.sale_price) finalProd.sale_price = source.sale_price;
            if (!finalProd.description && source.description) finalProd.description = source.description;
            if (!finalProd.full_description && source.full_description) finalProd.full_description = source.full_description;
            if (!finalProd.imageUrl && source.imageUrl) finalProd.imageUrl = source.imageUrl;
            
            // Variants Patching: If source has more variants, use them (likely higher fidelity)
            if (source.variants && source.variants.length > finalProd.variants.length) {
                finalProd.variants = source.variants;
                finalProd.price_map = source.price_map || {};
            }
            
            if (source.technical_attributes) {
                if (!finalProd.technical_attributes) finalProd.technical_attributes = source.technical_attributes;
                else if (!finalProd.technical_attributes.includes(source.technical_attributes)) {
                    finalProd.technical_attributes += " | " + source.technical_attributes;
                }
            }
        };

        // 1. Identify Main Product Container
        const productContainers = ['.product-single', '.product-details', '.product-main', '.product-info', '.product-summary', '.entry-summary', '.product_wrapper', '.product-essential', '.product-shop'];
        let container = null;
        for (const s of productContainers) {
            const el = $(s).first();
            if (el.length > 0) { container = el; break; }
        }
        if (!container && isProductPage) container = $('body');

        // 2. Clone body for clean description extraction
        const $cleanBody = $.load($.html());
        $cleanBody('script, style, iframe, noscript, form, button, .variations, .woocommerce-variation-add-to-cart, .zoomContainer').remove();

        const shortDescSelectors = ['.product-short-description', '.summary', '.woocommerce-product-details__short-description', '.short-description', '.product-excerpt', '.post-excerpt'];
        const longDescSelectors = ['.product-description', '#description', '.description', '[itemprop="description"]', '.rte', '.woocommerce-tabs', '.product-tabs-content', '.entry-content', '.fusion-text', '#tab-description', '.product-info-main', '.product-details', '.additional-information', '#tab-additional_information', '.pro-detail', '.product-specs', '.specification-tabs', '.tab-content'];

        const shortDescRaw = $cleanBody(shortDescSelectors.join(', ')).first().html();
        const longDescRaw = $cleanBody(longDescSelectors.join(', ')).not(shortDescSelectors.join(', ')).first().html() || $cleanBody(longDescSelectors.join(', ')).first().html();
        const shortDesc = this.cleanHtmlDescription(shortDescRaw);
        const longDesc = this.cleanHtmlDescription(longDescRaw);

        // V13.1: Universal Metadata Extraction
        const universalMetadata = this.extractUniversalMetadata($, container, (shortDescRaw || "") + (longDescRaw || ""));
        finalProd.technical_attributes = universalMetadata.technical_attributes;

        // --- ENGINE 1: NEXT.JS DATA (Highest Fidelity) ---
        const nextData = this.extractNextData($);
        if (nextData && isProductPage) {
            let sailorImage = nextData.thumbnail_image || (nextData.photos && nextData.photos.length > 0 ? (nextData.photos[0].path || nextData.photos[0].image) : null);
            if (sailorImage && !sailorImage.startsWith('http')) {
                const urlObj = new URL(sourceUrl);
                sailorImage = `${urlObj.protocol}//${urlObj.hostname}${sailorImage.startsWith('/') ? '' : '/'}${sailorImage}`;
            }

            const nextProd = {
                name: nextData.name,
                sku: nextData.sku,
                price: nextData.main_price || nextData.calculable_price,
                regular_price: nextData.stroked_price || nextData.main_price,
                sale_price: nextData.has_discount ? (nextData.main_price || nextData.calculable_price) : "",
                description: shortDesc || (nextData.description ? this.cleanHtmlDescription(nextData.description).substring(0, 300) : ""),
                full_description: this.cleanHtmlDescription(nextData.description) || longDesc || "",
                imageUrl: sailorImage,
                technical_attributes: nextData.fit ? `Fit: ${nextData.fit}` : ""
            };

            const variantData = this.extractVariants($, container, sourceUrl);
            if (variantData) {
                nextProd.variants = variantData.variants;
                nextProd.price_map = variantData.price_map;
            }
            patch(nextProd);
            
            // Waterfall Guard: If Next.js gave us Name, Price AND Variants, skip other engines
            if (finalProd.name && finalProd.price && finalProd.variants.length > 0) {
                console.log(`[Scraper] 🏁 High Fidelity Win: Next.js Engine extracted complete data for ${finalProd.name}`);
                return await this.addProduct(this.normalizeProduct(finalProd));
            }
        }

        // --- ENGINE 2: JSON-LD ---
        if (!finalProd.name || !finalProd.price || finalProd.variants.length === 0) {
            const ldJsonScripts = $('script[type="application/ld+json"]').toArray();
            for (const el of ldJsonScripts) {
                try {
                    const json = JSON.parse($(el).html() || "");
                    const items = json['@graph'] || (Array.isArray(json) ? json : [json]);
                    for (const item of items) {
                        const type = item['@type'];
                        if (type === 'Product' || type === 'http://schema.org/Product') {
                            if (!item.name || item.name.toLowerCase().includes('category')) continue;

                            const variantData = this.extractVariants($, container, sourceUrl);
                            let variants = variantData ? variantData.variants : [];
                            let price_map = variantData ? variantData.price_map : {};

                            const offers = Array.isArray(item.offers) ? item.offers : (item.offers ? [item.offers] : []);
                            if (offers.length > 1 || variants.length === 0) {
                                offers.forEach((off, i) => {
                                    let vVal = off.name || off.sku || `Option ${i+1}`;
                                    if (off.price) price_map[vVal] = this.toEngDigits(String(off.price));
                                    if (!variants.some(v => v.value === vVal)) {
                                        variants.push({ type: "Option", value: vVal, price: off.price, sku: off.sku });
                                    }
                                });
                            }

                            let img = item.image;
                            if (Array.isArray(img)) img = img[0];
                            if (typeof img === 'object') img = img.url || img.contentUrl || img.image;

                            const semanticData = this.intelligentSemanticMapping(item, longDescRaw, item);
                            patch({
                                name: item.name,
                                sku: item.sku || item.mpn || this.extractSKU($, container),
                                price: item.offers?.price || item.offers?.[0]?.price || item.offers?.lowPrice,
                                description: this.cleanHtmlDescription(item.description)?.substring(0, 300),
                                full_description: this.cleanHtmlDescription(item.description),
                                imageUrl: img,
                                technical_attributes: semanticData.technical_attributes,
                                variants: variants,
                                price_map: price_map
                            });
                        }
                    }
                } catch (e) {}
            }
        }

        // --- ENGINE 3: META INFO ---
        if (!finalProd.name || !finalProd.price || finalProd.variants.length === 0) {
            patch(this.extractMetaInfo($, sourceUrl, isProductPage, shortDesc, longDesc, container));
        }

        // --- ENGINE 4: DOM FALLBACK (The most expensive and noise-prone) ---
        if (isProductPage && (!finalProd.name || !finalProd.price || finalProd.variants.length === 0)) {
            const priceData = this.extractPriceCluster($, container);
            const variantData = this.extractVariants($, container, sourceUrl);
            patch({
                name: this.extractName($, container) || pageTitle.split('-')[0].trim(),
                sku: this.extractSKU($, container),
                price: priceData.price,
                regular_price: priceData.regular_price,
                sale_price: priceData.sale_price,
                description: shortDesc,
                full_description: longDesc,
                imageUrl: this.extractImage($, container),
                variants: variantData?.variants || [],
                price_map: variantData?.price_map || {}
            });
        }

        // --- ENGINE 5: UNIVERSAL STRUCTURAL ANALYSIS (v21.0 Non-AI) ---
        if (isProductPage && (!finalProd.name || !finalProd.price)) {
            console.log(`[Scraper] 🕵️ Standard engines failed. Triggering Structural Fallback for: ${sourceUrl}`);
            const structuralPrice = structuralAnalyzer.extractPriceProximity($, container);
            if (structuralPrice) {
                patch({
                    price: structuralPrice.sale_price,
                    regular_price: structuralPrice.regular_price,
                    sale_price: structuralPrice.sale_price
                });
            }
            
            // If name is still missing, try to find the largest heading in the container
            if (!finalProd.name) {
                const largestHeading = container.find('h1, h2, .product-title, .title').first().text().trim();
                if (largestHeading) patch({ name: largestHeading });
            }
        }

        // FINAL PRODUCT ADDITION
        const validation = BASELINE.policy.integrityCheck(finalProd);
        if (validation.valid) {
            await this.addProduct(this.normalizeProduct(finalProd));
        } else {
            console.warn(`[Scraper] 🛡️ Policy Guard: Product Rejected (${validation.reason}): ${sourceUrl}`);
        }
    }

    async addProduct(prod) {
        // v14.0 Enterprise: Stateless Streaming Optimization
        if (this.isStreaming) {
            if (this.onProductCallback) {
                await this.onProductCallback(prod);
            }
            return;
        }

        // v3: Data Enrichment Logic
        const prodUrl = prod.product_url ? prod.product_url.split('?')[0].replace(/\/$/, "") : "";
        const prodName = (prod.name || "").trim();
        const prodPriceNum = parseFloat(String(prod.price || "").replace(/[^0-9.]/g, ''));

        const existingIndex = this.data.products.findIndex(p => {
            const existingUrl = p.product_url ? p.product_url.split('?')[0].replace(/\/$/, "") : "";
            if (prodUrl && existingUrl) return prodUrl === existingUrl;

            const existingPriceNum = parseFloat(String(p.price || "").replace(/[^0-9.]/g, ''));
            return (p.name === prodName && Math.abs(existingPriceNum - prodPriceNum) < 1);
        });

        if (existingIndex !== -1) {
            const existing = this.data.products[existingIndex];

            // V9.8: Safe Data Reconciliation
            const currentVariants = this.safeJsonParse(existing.variants, { items: [] });
            const newVariants = this.safeJsonParse(prod.variants, { items: [] });

            const finalRegular = (prod.regular_price && prod.regular_price.match(/\d/)) ? prod.regular_price : existing.regular_price;
            const finalSale = (prod.sale_price && prod.sale_price.match(/\d/)) ? prod.sale_price : existing.sale_price;

            const hasExistingSymbol = /[৳$]|Tk|BDT/i.test(existing.price || "");
            const hasNewSymbol = /[৳$]|Tk|BDT/i.test(prod.price || "");

            // Quality Check: Is the new data higher fidelity?
            const isNewRicher = (newVariants.items?.length > (currentVariants.items?.length || 0)) ||
                (prod.full_description && (!existing.full_description || prod.full_description.length > (existing.full_description?.length || 0) * 1.1)) ||
                (prod.imageUrl && typeof prod.imageUrl === 'string' && prod.imageUrl.includes('http') && !existing.imageUrl) ||
                (hasNewSymbol && !hasExistingSymbol);

            if (isNewRicher) {
                let finalVariantsObj = prod.variants;
                if (currentVariants.items?.length > (newVariants.items?.length || 0)) {
                    finalVariantsObj = existing.variants;
                }

                this.data.products[existingIndex] = {
                    ...existing,
                    ...prod,
                    name: prod.name || existing.name,
                    description: prod.description || existing.description,
                    variants: this.safeJsonStringify(finalVariantsObj),
                    regular_price: finalRegular,
                    sale_price: finalSale,
                    full_description: (prod.full_description && prod.full_description.length > (existing.full_description?.length || 0)) ? prod.full_description : existing.full_description,
                    composition: prod.composition || prod.materials || existing.composition || existing.materials,
                    handling_guidelines: prod.handling_guidelines || prod.wash_instructions || existing.handling_guidelines || existing.wash_instructions,
                    technical_attributes: prod.technical_attributes || prod.specifications || existing.technical_attributes || existing.specifications
                };

                // Trigger callback so that the DB persister knows the product got an upgrade (e.g. description fetched from DOM)
                if (this.onProductCallback) {
                    await this.onProductCallback(this.data.products[existingIndex]);
                }
            }
            return;
        }

        // Final sanity check for variants
        const validatedVariants = this.safeJsonStringify(prod.variants || { items: [], price_map: {}, sizes: [], colors: [] });
        const v = this.safeJsonParse(validatedVariants);

        if (v.items && v.items.length > 0) {
            console.log(`[Scraper] 📦 Variation detected: ${prod.name} (${v.items.length} options)`);
        }

        const newProduct = {
            ...prod,
            variants: validatedVariants
        };
        this.data.products.push(newProduct);

        if (this.onProductCallback) {
            await this.onProductCallback(newProduct);
        }
    }

    discoverLinks($, currentUrl) {
        // v21.0: Universal Structural Discovery (Non-AI)
        // Analyzes the visual structure to find product clusters even on unknown platforms
        try {
            const clusters = structuralAnalyzer.findProductClusters($);
            if (clusters.length > 0) {
                console.log(`[Scraper] 🕵️ Structural Analyzer found ${clusters.length} potential product clusters on: ${currentUrl}`);
                clusters.forEach(cluster => {
                    cluster.elements.forEach(el => {
                        const $item = $(el);
                        // Find all links in this cluster element
                        $item.find('a').each((_, a) => {
                            const href = $(a).attr('href');
                            if (href) {
                                // Add to queue with high priority as it's structurally confirmed as a product listing
                                this.processAndQueueUrl(href, currentUrl, 95, 'product');
                            }
                        });
                    });
                });
            }
        } catch (e) {
            console.error(`[Scraper] ❌ Structural Discovery Error: ${e.message}`);
        }

        const productHubSelectors = [
            '.product-item', '.item.product-item-info', '.product-image-container',
            '.products.grid', '.products.list', '.product-block', '.product-inner',
            '.next-product', '.product-card', '.product-single'
        ];
        const productDensity = productHubSelectors.reduce((acc, sel) => acc + $(sel).length, 0);

        $('a').each((_, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().toLowerCase();
            
            // Heuristic boost for links with prominent product-related text
            let priority = null;
            let type = null;
            
            if (text.includes('next') || text.includes('page') || /^\d+$/.test(text.trim())) {
                priority = 95;
                type = 'pagination';
            } else if (text.includes('shipping') || text.includes('delivery')) {
                priority = 15;
                type = 'shipping';
            } else if (productDensity > 3) {
                // If the page has high product density, general links might be categories
                priority = 80;
                type = 'category';
            }

            this.processAndQueueUrl(href, currentUrl, priority, type);
        });
    }

    processAndQueueUrl(href, currentUrl, forcedPriority = null, forcedType = null) {
        if (!href || href.startsWith('javascript') || href.startsWith('#')) return;

        try {
            const urlObj = new URL(href, currentUrl);
            const fullUrl = this.normalizeUrl(urlObj.href);

            if (urlObj.hostname !== this.domain && !urlObj.hostname.endsWith('.' + this.domain)) return;

            const skipPatterns = [
                '/cart', '/checkout', '/my-account', '/login', '/logout', '/register', 'add-to-cart',
                '/terms', '/privacy', '/news', '/blog', '/contact', '/about', '/policy', '/refund',
                '/shipping', '/return', '/wishlist', '/compare', '/order-tracking'
            ];
            if (skipPatterns.some(p => fullUrl.includes(p))) return;

            const mediaExtensions = ['.mp4', '.mp3', '.wav', '.zip', '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.exe', '.rar'];
            if (mediaExtensions.some(ext => fullUrl.toLowerCase().endsWith(ext))) return;

            if (this.visited.has(fullUrl)) return;
            if (this.queue.some(q => q.url === fullUrl)) return;

            let priority = forcedPriority || 5;
            let type = forcedType || 'general';

            if (!forcedPriority) {
                const isProductUrl = fullUrl.includes('/product/') || fullUrl.includes('/products/') || fullUrl.includes('/item/') || fullUrl.includes('/p/') || fullUrl.includes('/details/');
                const isCategoryUrl = fullUrl.includes('/collections/') || fullUrl.includes('/category/') || fullUrl.includes('/catalogue/') || fullUrl.includes('/shop/');

                if (isProductUrl) {
                    priority = 100;
                    type = 'product';
                } else if (isCategoryUrl) {
                    priority = 80;
                    type = 'category';
                }
            }

            // Global discovery suppression if we have enough products
            if (this.data.products.length > 50 && type === 'general' && priority < 10) return;

            this.queue.push({ url: fullUrl, priority, type });
        } catch (e) { }
    }
    /**
     * V13.1: Universal Metadata Hub
     * Pillar B: Differential Extraction Logic
     * Metadata = ProductArea - Description - UI Noise
     */
    extractUniversalMetadata($, container, descriptionHtml) {
        if (!container || container.length === 0) return { technical_attributes: "", composition: "", handling_guidelines: "" };

        try {
            // Clone container to avoid mutating the main DOM
            const $meta = $.load(container.html());
            const metaBody = $meta('body');

            // 1. Remove UI Noise (Buttons, Socials, Forms, etc.)
            metaBody.find('button, form, .social-sharing, .product-share, .add-to-cart, .qty, .quantity, .product-form, script, style, .zoomContainer').remove();

            // 2. Exact Description Pruning (Pillar A)
            if (descriptionHtml) {
                const descText = this.cleanHtmlDescription(descriptionHtml);
                if (descText.length > 50) {
                    metaBody.find('*').each((i, el) => {
                        const $el = $(el);
                        const text = $el.text().trim();
                        if (text && text.length > 50 && descText.includes(text) && text.length > descText.length * 0.8) {
                            $el.remove();
                        }
                    });
                }
            }

            // 3. Clean and return the remaining text as catch-all metadata
            let rawText = metaBody.text()
                .replace(/\s+/g, ' ')
                .replace(/\n+/g, '\n')
                .trim();

            const semantic = this.intelligentSemanticMapping({ full_description: rawText }, rawText, null);

            return {
                technical_attributes: semantic.technical_attributes || rawText.substring(0, 500)
            };
        } catch (e) {
            return { technical_attributes: "" };
        }
    }
}

module.exports = SmartScraper;
