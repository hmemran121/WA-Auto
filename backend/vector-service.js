const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();
const dbUtils = require('./db');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const EMBEDDING_MODEL = 'gemini-embedding-001';

// Pure JS Cosine Similarity for robust, cross-platform functionality
// This avoids complex compiled DB extensions in Windows
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

class VectorService {
    constructor() {
        this.model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
        this.isSyncing = false; // 🔒 STRICT LOCK: Prevents any concurrent or accidental auto-vectorization
        
        // Enterprise In-Memory Indexing
        this.productIndex = [];
        this.knowledgeIndex = [];
        this.indexBuiltAt = null;
        this.INDEX_TTL = 5 * 60 * 1000; // 5 minutes refresh
    }

    // --- Enterprise In-Memory Indexing ---
    async buildIndex() {
        const products = await dbUtils.getAIProducts({ limit: 50000 });
        this.productIndex = (products || []).map(p => {
            let vec = null;
            if (p.embedding && p.embedding !== 'null' && p.embedding.length > 10) {
                try { vec = new Float32Array(JSON.parse(p.embedding)); } catch (e) {}
            }
            return { ...p, vec };
        });

        const docs = await dbUtils.getKnowledgeDocuments();
        this.knowledgeIndex = (docs || []).map(d => {
            let vec = null;
            if (d.embedding && d.embedding !== 'null' && d.embedding.length > 10) {
                try { vec = new Float32Array(JSON.parse(d.embedding)); } catch (e) {}
            }
            return { ...d, vec };
        });

        this.indexBuiltAt = Date.now();
        console.log(`[Index] ⚡ Built with ${this.productIndex.length} products and ${this.knowledgeIndex.length} docs`);
    }

    async getIndex() {
        if (!this.indexBuiltAt || Date.now() - this.indexBuiltAt > this.INDEX_TTL) {
            if (!this.isSyncing) {
                this.buildIndex().catch(console.error);
            }
        }
        if (this.productIndex.length === 0 && this.knowledgeIndex.length === 0) {
            await this.buildIndex();
        }
        return { products: this.productIndex, knowledge: this.knowledgeIndex };
    }

    async findSemanticCacheHit(queryEmbedding, threshold = 0.92) {
        try {
            const queryVec = new Float32Array(queryEmbedding);
            const recentCaches = await dbUtils.getRecentCachedAIResponses(200);
            let bestMatch = null;
            let bestSim = 0;
            for (const cached of recentCaches) {
                if (cached.vector && cached.vector.length > 10) {
                    try {
                        const cachedVec = new Float32Array(JSON.parse(cached.vector));
                        const sim = cosineSimilarity(queryVec, cachedVec);
                        if (sim > threshold && sim > bestSim) {
                            bestMatch = cached;
                            bestSim = sim;
                        }
                    } catch (e) {}
                }
            }
            if (bestMatch) {
                console.log(`[Cache Hit] 🎯 Semantic Match found (Sim: ${bestSim.toFixed(2)})`);
            }
            return bestMatch;
        } catch (e) {
            return null;
        }
    }

    async getAnchoredProductId(queryLower) {
        const index = await this.getIndex();
        for (const p of index.products) {
            if (p.sku && queryLower.includes(p.sku.toLowerCase())) { return p.id; }
            if (p.name && queryLower.includes(p.name.toLowerCase())) { return p.id; }
        }
        return null;
    }

    async generateEmbedding(text) {
        if (!text || text.trim() === '') return [];
        
        let retries = 3;
        let delay = 1500;

        for (let i = 0; i < retries; i++) {
            try {
                const result = await this.model.embedContent(text);
                return result.embedding.values;
            } catch (error) {
                const isTransient = error.message.includes('fetch failed') || error.message.includes('ECONNRESET');
                if (isTransient && i < retries - 1) {
                    console.warn(`[Vector-Retry] Embedding failed (fetch failure). Retrying in ${delay}ms... (${i + 1}/${retries})`);
                    await new Promise(r => setTimeout(r, delay));
                    delay *= 2;
                    continue;
                }
                console.error("Embedding Generation Error:", error.message);
                return [];
            }
        }
        return [];
    }

    // --- Purification Utilities ---
    purifyText(text) {
        if (!text) return "";
        // Remove HTML tags
        let clean = text.replace(/<[^>]*>?/gm, ' ');
        // Remove extra whitespace
        clean = clean.replace(/\s+/g, ' ').trim();
        // Limit to 500 chars (concise RAG)
        if (clean.length > 500) {
            clean = clean.substring(0, 497) + "...";
        }
        return clean;
    }

    // Format text specifically for embedding representation
    getProductText(product) {
        let variants = {};
        let variantText = "";
        try {
            variants = typeof product.variants === 'string' ? JSON.parse(product.variants || '{}') : (product.variants || {});
        } catch (e) {
            variantText = product.variants;
        }

        if (variants && variants.price_map && Object.keys(variants.price_map).length > 0) {
            variantText = Object.entries(variants.price_map)
                .map(([key, price]) => `[SPEC: ${key}, PRICE: ${price} BDT]`)
                .join(" | ");
        } else if (Array.isArray(variants.items)) {
            variantText = variants.items.map(v => `[SPEC: ${v.type || v.name || v.value}, PRICE: ${v.price || product.price} BDT]`).join(" | ");
        } else if (Array.isArray(variants)) {
            variantText = variants.map(v => `[SPEC: ${v.type || v.name || v.value}, PRICE: ${v.price || product.price} BDT]`).join(" | ");
        }

        const description = this.purifyText(product.full_description || product.description);

        return `PRODUCT_ROOT: ${product.name} | BASE_PRICE: ${product.price || 'N/A'} | EXACT_SPECIFICATIONS: ${variantText || 'Standard'} | PRODUCT_DETAILS: ${description}`;
    }

    getProfileText(profile, isDetailed = false) {
        const parts = [
            profile.company_name ? `Business: ${profile.company_name}` : ""
        ];
        if (isDetailed) {
            if (profile.address) parts.push(`Address: ${profile.address}`);
            if (profile.about_text) parts.push(`About: ${this.purifyText(profile.about_text).slice(0, 150)}`);
            if (profile.operating_hours) parts.push(`Hours: ${profile.operating_hours}`);
        }
        return parts.filter(Boolean).join(" | ");
    }

    getKnowledgeText(doc) {
        return `Category: ${doc.type} | Topic: ${doc.title} | Content: ${this.purifyText(doc.content)}`;
    }

    // --- Manual Sync Methods ---

    async syncProductsEmbeddings(onLog = null) {
        // 🔒 STRICT GUARD: Prevent concurrent or accidental auto-vectorization
        if (this.isSyncing) {
            const msg = '⚠️ [GUARD] Vector sync already in progress. Ignoring duplicate/auto call.';
            console.warn(msg);
            if (onLog) onLog(msg, 'warning');
            return 0;
        }

        this.isSyncing = true;
        const log = (msg, type = 'info') => {
            console.log(msg);
            if (onLog) onLog(msg, type);
        };

        // 🔍 TRACE: Log a stack trace snippet so we always know WHO triggered this
        const stack = new Error().stack?.split('\n').slice(2, 5).join(' -> ') || 'unknown';
        console.log(`[VectorService] 🚨 syncProductsEmbeddings TRIGGERED. Caller trace: ${stack}`);

        try {
            log("🔄 Manual Product Vector Sync Started (Pending Only)...");
            // Production-Grade: We only sync what's needed to save API costs and time
            const products = await dbUtils.getAIProducts({ limit: 10000 });
            const pendingProducts = products.filter(p => !p.embedding || p.embedding === 'null' || p.embedding === '[]' || p.embedding === '');
            
            if (pendingProducts.length === 0) {
                log("✅ No pending products found. Everything is up to date.", 'success');
                return 0;
            }

            log(`📦 Found ${pendingProducts.length} pending products. Processing...`);

            let updated = 0;
            for (const product of pendingProducts) {
                const text = this.getProductText(product);
                const emb = await this.generateEmbedding(text);
                if (emb && emb.length > 0) {
                    await dbUtils.updateAIProduct(product.id, { embedding: JSON.stringify(emb) });
                    updated++;
                    log(`⚡ Vectorized [${updated}/${pendingProducts.length}]: ${product.name}`, 'success');
                }
            }

            log(`✅ Product Sync Complete. Updated ${updated} items.`, 'success');
            return updated;
        } finally {
            this.isSyncing = false; // Always release the lock
        }
    }

    async syncProfileEmbedding(onLog = null) {
        const log = (msg, type = 'info') => {
            console.log(msg);
            if (onLog) onLog(msg, type);
        };

        log("🔄 Manual Business Profile Vector Sync Started...");
        const profile = await dbUtils.getBusinessProfile();
        if (!profile.id) {
            log("❌ No business profile found.", 'error');
            return 0;
        }

        const text = this.getProfileText(profile);
        const emb = await this.generateEmbedding(text);
        if (emb && emb.length > 0) {
            // We need a way to update profile embedding. 
            // In db.js, saveBusinessProfile handles update/insert.
            // I'll call updateBusinessProfile (needs to be added or used save)
            await dbUtils.saveBusinessProfile({ ...profile, embedding: JSON.stringify(emb) });
            log("⚡ Business Profile Vectorized.", 'success');
            log(`✅ Profile Sync Complete.`, 'success');
            return 1;
        }
        return 0;
    }

    async syncKnowledgeEmbeddings(onLog = null) {
        const log = (msg, type = 'info') => {
            console.log(msg);
            if (onLog) onLog(msg, type);
        };

        log("🔄 Smart Knowledge Base Sync Initalized...");
        // Only fetch docs with NULL embedding
        const pendingDocs = await dbUtils.getKnowledgeDocuments({ onlyUnvectorized: true });
        
        if (pendingDocs.length === 0) {
            log("✅ Already Synchronized: No new/updated documents found.", 'success');
            return 0;
        }

        log(`🚀 Vectorizing ${pendingDocs.length} pending fragments...`);
        let updated = 0;

        for (const doc of pendingDocs) {
            const text = this.getKnowledgeText(doc);
            const emb = await this.generateEmbedding(text);
            if (emb && emb.length > 0) {
                await dbUtils.updateKnowledgeDocument(doc.id, { embedding: JSON.stringify(emb) });
                updated++;
                log(`⚡ [Success] Vectorized: ${doc.title}`, 'success');
            } else {
                log(`⚠️ [Skip] Failed to vectorize: ${doc.title}`, 'warning');
            }
        }

        log(`✅ Incremental Sync Complete: ${updated} fragments added to the Brain.`, 'success');
        return updated;
    }

    /**
     * PRODUCTION-GRADE INDIVIDUAL SYNC:
     * Re-vectorizes a single product immediately after an update.
     */
    async reindexProduct(productId) {
        try {
            console.log(`[VectorService] 🎯 Immediate Re-Indexing triggered for Product ID: ${productId}`);
            const product = await dbUtils.getAIProductById(productId);
            if (!product) {
                console.error(`[VectorService] ❌ Re-index failed: Product ${productId} not found.`);
                return false;
            }

            const text = this.getProductText(product);
            const emb = await this.generateEmbedding(text);

            if (emb && emb.length > 0) {
                await dbUtils.updateAIProduct(productId, { 
                    embedding: JSON.stringify(emb),
                    manual_override: 1 // Ensure we keep state
                });
                
                // Immediate in-memory update
                const updatedProduct = await dbUtils.getAIProductById(productId);
                const idx = this.productIndex.findIndex(p => p.id === productId);
                if (idx !== -1) {
                    this.productIndex[idx] = { ...updatedProduct, vec: new Float32Array(emb) };
                } else {
                    this.productIndex.push({ ...updatedProduct, vec: new Float32Array(emb) });
                }
                
                // Invalidate response cache
                await dbUtils.invalidateProductCache(productId).catch(e => console.error('[Cache Invalidate Error]', e));

                console.log(`[VectorService] ⚡ Real-time Sync Success: ${product.name}`);
                return true;
            }
            return false;
        } catch (err) {
            console.error(`[VectorService] ❌ Re-index Error for ${productId}:`, err.message);
            return false;
        }
    }

    // --- 18-Intent Classifier Engine (Enterprise Zero-Miss Architecture) ---
    detectUserIntent(query) {
        const q = (query || '').toLowerCase().trim();
        const intents = new Set();

        // 1. GREETING_SOCIAL
        if (/^(হ্যালো|হ্যালৌ|হাই|আসসালামু|আসসালামু আলাইকুম|সালাম|নমস্কার|hi|hello|hey|good morning|good evening|গুদ মর্নিং)/i.test(q) && q.split(/\s+/).length <= 4) {
            intents.add('GREETING_SOCIAL');
        }

        // 2. ORDER_STATUS_TRACKING
        if (/(ট্র্যাকিং|কবে পাবো|অর্ডারটি কোথায়|পার্সেল|কুরিয়ার|ডেলিভারি দেরি|বিলম্ব|আজকে পাবো|স্ট্যাটাস|কবে আসবে|tracking|where is my order|order status)/i.test(q)) {
            intents.add('ORDER_STATUS_TRACKING');
        }

        // 3. PAYMENT_PROOF_VERIFICATION
        if (/(টাকা পাঠাইছি|টাকা পাঠিয়েছি|ট্রানজেকশন|বিকাশ করেছি|স্ক্রিনশট|trxid|transid|payment done|paid|bkash done)/i.test(q)) {
            intents.add('PAYMENT_PROOF_VERIFICATION');
        }

        // 4. ORDER_MODIFICATION_CANCEL
        if (/(ক্যানসেল|বাতিল|এড্রেস চেঞ্জ|ঠিকানা পরিবর্তন|আইটেম বাদ|অন্য প্রোডাক্ট নিবো|অর্ডার চেঞ্জ|cancel|change address)/i.test(q)) {
            intents.add('ORDER_MODIFICATION_CANCEL');
        }

        // 5. COMPLAINT_HUMAN_HANDOVER
        if (/(খারাপ|নষ্ট|ভুল প্রোডাক্ট|জোচ্চোর|প্রতারণা|ম্যানেজার|মানুষের সাথে|হিউম্যান|কল দেন|কল দিন|কথা বলবো|agent|call me|human|complaint)/i.test(q)) {
            intents.add('COMPLAINT_HUMAN_HANDOVER');
        }

        // 6. ORDER_CONFIRMATION_BUYING
        if (/(অর্ডার করবো|কনফার্ম|নিতে চাই|অর্ডার দিতে চাই|confirm order|i want to buy|buy now|ঠিকানা দিচ্ছি|এড্রেস দিচ্ছি)/i.test(q)) {
            intents.add('ORDER_CONFIRMATION_BUYING');
        }

        // 7. DISCOUNT_BARGAIN_PROMO
        if (/(কম রাখা যাবে|ডিসকাউন্ট|কুপন|ছাড়|দাম বেশি|একটু কম|কম হবে|discount|coupon|promo|bargain|bulk|পাইকারি)/i.test(q)) {
            intents.add('DISCOUNT_BARGAIN_PROMO');
        }

        // 8. PAYMENT_METHODS_DETAILS
        if (/(বিকাশ নাম্বার|নগদ নাম্বার|ব্যাংক একাউন্ট|পেমেন্ট মেথড|ক্যাশ অন|অগ্রিম কত|বিকাশ কি|payment method|bkash number|cod)/i.test(q)) {
            intents.add('PAYMENT_METHODS_DETAILS');
        }

        // 9. LOCATION_COVERAGE
        if (/(কভারেজ|হোম ডেলিভারি|আমার এলাকায়|কুরিয়ার অফিস|বগুড়া|চট্টগ্রাম|সিলেট|রাজশাহী|খুলনা|বরিশাল|রংপুর|ময়মনসিংহ|গ্রাম|থানা|district|coverage|location)/i.test(q)) {
            intents.add('LOCATION_COVERAGE');
        }

        // 10. DELIVERY_LOGISTICS
        if (/(ডেলিভারি চার্জ|পৌঁছাতে কত দিন|কত খরচ|শিপিং|ডেলিভারি কত|delivery charge|shipping fee|how many days)/i.test(q)) {
            intents.add('DELIVERY_LOGISTICS');
        }

        // 11. POLICIES_RETURNS_EXCHANGE
        if (/(ফেরত|রিফান্ড|এক্সচেঞ্জ|চেঞ্জ|ড্যামেজ হলে|ওয়ারেন্টি|গারান্টি|গ্যারান্টি|return|refund|exchange|guarantee)/i.test(q)) {
            intents.add('POLICIES_RETURNS_EXCHANGE');
        }

        // 12. STORE_LOCATION_INFO
        if (/(দোকান কোথায়|শোরুম|অফিস কোথায়|ঠিকানা কী|গুগল ম্যাপ|টাইমিং|কখন খোলা|address|location|shop|outlet)/i.test(q) && !/(অর্ডার|আইটেম)/i.test(q)) {
            intents.add('STORE_LOCATION_INFO');
        }

        // 13. TRUST_AUTHENTICITY_REVIEWS
        if (/(অরিজিনাল|আসল|খাঁটি|রিভিউ|কাস্টমার কি বলছে|পেইজ আসল|প্রমাণ|authentic|original|reviews|proof)/i.test(q)) {
            intents.add('TRUST_AUTHENTICITY_REVIEWS');
        }

        // 14. PRODUCT_RECOMMENDATION
        if (/(কোনটা ভালো|সাজেশন|পরামর্শ|উপযোগী|বয়স|স্কিন|কার জন্য|recommendation|best choice|suggest)/i.test(q)) {
            intents.add('PRODUCT_RECOMMENDATION');
        }

        // 15. COMPARISON_CROSS_SELL
        if (/(পার্থক্য|তুলনা|পার্থক্য কি|vs|difference|better)/i.test(q)) {
            intents.add('COMPARISON_CROSS_SELL');
        }

        // 16. PRODUCT_DETAILS_DEEP
        if (/(উপাদান|কী দিয়ে তৈরি|অরিজিন|কোথাকার|উপকারিতা|ব্যবহারের নিয়ম|সাইজ চার্ট|ওয়েট|সাইজ কত|মেটেরিয়াল|উপাদান কি|material|origin|benefits|ingredients|specs)/i.test(q)) {
            intents.add('PRODUCT_DETAILS_DEEP');
        }

        // 17. PRICE_AVAILABILITY (Default fallback if catalog question or no other matches)
        if (/(দাম কত|কত টাকা|স্টক|আছে কি|পাওয়া যাবে|মূল্য কত|price|available|cost)/i.test(q) || intents.size === 0) {
            if (!intents.has('DELIVERY_LOGISTICS') && !intents.has('PAYMENT_METHODS_DETAILS') && !intents.has('GREETING_SOCIAL')) {
                intents.add('PRICE_AVAILABILITY');
            }
        }

        return Array.from(intents);
    }

    // --- Unified Search & Context (Hierarchy of Truth) ---
    async getUnifiedContextWithEmb(query, number = null, queryEmbedding = null, limit = 5) {
        const queryLower = query.toLowerCase();
        const now = new Date().toISOString();
        const detectedIntents = this.detectUserIntent(query);
        
        const emb = queryEmbedding || await this.generateEmbedding(query);
        const index = await this.getIndex();
        const allProducts = index.products;
        
        // 0. Fetch Personalization Context
        let persContext = "";
        if (number) {
            const pData = await dbUtils.getPersonalizationData(number);
            let orderLine = "- Last Order Status: No active orders found.";
            if (pData.last_order) {
                orderLine = `- Active Order Status: ${pData.last_order.status.toUpperCase()} (ID: ${pData.last_order.tracking || 'N/A'})\n            - Est. Delivery: ${pData.last_order.delivery || 'Pending'}\n            - Order Amount: ${pData.last_order.amount || 'N/A'}`;
            }

            persContext = `[CUSTOMER PROFILE]: 
            - Name: ${pData.name || 'Unknown'}
            - Tier: ${pData.engagement || 'New'}
            ${orderLine}
            - Customer Tags: ${(pData.tags || []).join(', ')}\n\n`;
        }

        // Fast-Path: Greeting Only Intent
        if (detectedIntents.includes('GREETING_SOCIAL') && detectedIntents.length === 1) {
            const profile = await dbUtils.getBusinessProfile();
            const bName = profile ? (profile.company_name || 'our store') : 'our store';
            return `[DETECTED INTENT: GREETING_SOCIAL]\n${persContext}[OFFICIAL PROFILE]: Business Name: ${bName}\n[GREETING DIRECTIVE]: Reply warmly, welcoming the customer to ${bName}. Ask politely how you can assist them today. Do NOT output long product lists or policy details unless requested.`;
        }

        // 1. Identify Product Matches (Exact Anchor + Multi-Keyword Matching)
        const STOP_WORDS = new Set(['কি', 'কী', 'কি কি', 'আছে', 'না', 'ধরনের', 'টাইপ', 'প্রকার', 'কতো', 'দাম', 'কত', 'আছে কি না', 'হবে', 'দিন', 'চাই', 'কাছে', 'আপনাদের', 'আমাদের', 'কোন', 'কোন্', 'মাছ', 'পণ্য', 'প্রোডাক্ট', 'আইটেম', 'item', 'items', 'product', 'products', 'goods', 'what', 'which', 'is', 'are', 'there', 'have', 'do', 'you', 'price', 'cost']);
        const queryTokens = queryLower.split(/\s+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w));

        let keywordMatchedProducts = [];
        for (const p of allProducts) {
            const pName = (p.name || '').toLowerCase();
            const pSku = (p.sku || '').toLowerCase();
            const pCat = (p.category_name || '').toLowerCase();
            
            // Check if query has exact SKU or exact full name
            if ((pSku && queryLower.includes(pSku)) || (pName && queryLower.includes(pName))) {
                if (!keywordMatchedProducts.some(existing => existing.id === p.id)) {
                    keywordMatchedProducts.push(p);
                }
                continue;
            }
            
            // Check if any query token matches product name or category
            for (const token of queryTokens) {
                if (pName.includes(token) || pCat.includes(token)) {
                    if (!keywordMatchedProducts.some(existing => existing.id === p.id)) {
                        keywordMatchedProducts.push(p);
                    }
                    break;
                }
            }
        }

        let anchoredProduct = keywordMatchedProducts.length > 0 ? keywordMatchedProducts[0] : null;

        // 2. Fetch Pinned Knowledge (Tier 1)
        let pinnedContext = "";
        let specificPolicyContext = "";

        if (anchoredProduct) {
            let relevantPins = await dbUtils.getPinsForProduct(anchoredProduct.id, anchoredProduct.category_id);
            relevantPins = relevantPins.filter(k => !k.expiry_date || k.expiry_date > now);

            if (relevantPins.length > 0) {
                pinnedContext = "[GUARANTEED TRUTH - PINNED DATA]:\n" + 
                    relevantPins.map(k => {
                        dbUtils.incrementKnowledgeUsage(k.id);
                        const mediaInfo = k.media_url ? ` [MEDIA_ATTACH: ${k.media_url} (${k.media_type || 'image'})]` : "";
                        const actionInfo = k.action_tag ? ` [ACTION_TRIGGER: ${k.action_tag.toUpperCase()}]` : "";
                        return `- ${k.title}: ${k.content}${mediaInfo}${actionInfo} (Style: ${k.response_style})`;
                    }).join("\n") + "\n\n";
            }

            if (anchoredProduct.category_name) {
                specificPolicyContext = `[CATEGORY POLICY - ${anchoredProduct.category_name.toUpperCase()}]:\n` +
                    `- Delivery Inside: ${anchoredProduct.shipping_inside || 'Default'}\n` +
                    `- Delivery Outside: ${anchoredProduct.shipping_outside || 'Default'}\n` +
                    `- Special Instructions: ${anchoredProduct.special_policy || 'None'}\n\n`;
            }
        }

        // 3. Global Semantic Retrieval (Tier 2 - Fallback)
        const isPolicyInquiry = detectedIntents.some(i => ['DELIVERY_LOGISTICS', 'POLICIES_RETURNS_EXCHANGE', 'PAYMENT_METHODS_DETAILS', 'STORE_LOCATION_INFO', 'LOCATION_COVERAGE'].includes(i));
        const isBusinessOverview = /(আপনারা|তোমাদের|কোম্পানি|ব্যবসা|শপ|দোকান|কি\s*কাজ|কি\s*প্রডাক্ট|কি\s*পণ্য|কি\s*বিজনেছ|পরিচয়|কি\s*নিয়ে|কি\s*আইটেম|what\s*do\s*you\s*sell|about\s*us|business\s*overview)/i.test(queryLower);

        const kLimit = isPolicyInquiry ? 3 : 1;
        
        let globalKnowledgeDocs = await this.semanticSearchKnowledgeWithEmb(emb, kLimit);
        globalKnowledgeDocs = globalKnowledgeDocs.filter(k => !k.expiry_date || k.expiry_date > now);

        const generalKnowledgeContext = globalKnowledgeDocs.length > 0 ?
            "[GLOBAL BUSINESS RULES & FAQ]:\n" + 
            globalKnowledgeDocs.map(k => {
                dbUtils.incrementKnowledgeUsage(k.id);
                const mediaInfo = k.media_url ? ` [MEDIA_ATTACH: ${k.media_url} (${k.media_type || 'image'})]` : "";
                const actionInfo = k.action_tag ? ` [ACTION_TRIGGER: ${k.action_tag.toUpperCase()}]` : "";
                return `- ${k.title}: ${this.purifyText(k.content)}${mediaInfo}${actionInfo}`;
            }).join("\n") + "\n\n" : "";

        const businessProfile = await dbUtils.getBusinessProfile();
        const companyOverviewContext = isBusinessOverview ? 
            `[COMPANY BUSINESS OVERVIEW]:\n` +
            `- Company Name: ${businessProfile.company_name}\n` +
            `- About Business: ${businessProfile.about_text || 'We are a premium seller of fresh river and sea fish.'}\n` +
            `[DIRECTIVE: Provide a concise, warm 2-sentence introduction of the company and main offerings. Do NOT list long product price lists or tables.]\n\n` : "";

        // 4. Product Dynamic Context
        const skipCatalog = isBusinessOverview || (detectedIntents.length === 1 && ['DELIVERY_LOGISTICS', 'POLICIES_RETURNS_EXCHANGE', 'PAYMENT_METHODS_DETAILS', 'STORE_LOCATION_INFO', 'ORDER_STATUS_TRACKING'].includes(detectedIntents[0]));
        let productContext = "";

        if (!skipCatalog) {
            const isFullCatalogReq = /(সব|তালিকা|সকল|ক্যাটালগ|সমগ্র|কী\s*কী|কি\s*কি|আর\s*কী|আরও\s*কি|সবগুলো|all|list|catalog|menu|everything|show\s*all)/i.test(queryLower);
            let finalProducts = [];
            
            if (isFullCatalogReq) {
                // Tier-1 Progressive Root Summary (Ultra-Lean Catalog Overview)
                finalProducts = allProducts.filter(p => p.stock_status !== 0).slice(0, 15);
                if (finalProducts.length > 0) {
                    productContext = "[PRODUCT CATALOG DATA - TIER 1 ROOT OVERVIEW]:\n" +
                        "[PROGRESSIVE DISCLOSURE DIRECTIVE: Present ONLY Root Product Titles + Starting Base Prices. Do NOT dump long variant size/weight specs. Warmly ask customer which product they want to inspect or order.]\n" +
                        finalProducts.map(p => {
                            return `- ${p.name} (Category: ${p.category_name || 'General'}, BASE_PRICE: ${p.price} BDT) [IN STOCK]`;
                        }).join("\n") + "\n\n";
                }
            } else {
                if (keywordMatchedProducts.length > 0) {
                    finalProducts = keywordMatchedProducts.slice(0, 6);
                } else {
                    finalProducts = await this.semanticSearchProductsWithEmb(emb, 4, 0.45);
                }

                if (finalProducts.length > 0) {
                    productContext = "[PRODUCT CATALOG DATA]:\n" + 
                        finalProducts.map(p => {
                            const isOutOfStock = p.stock_status === 0;
                            const status = isOutOfStock ? ' [OUT OF STOCK]' : ' [IN STOCK]';
                            
                            let vText = "";
                            try {
                                const vJSON = typeof p.variants === 'string' ? JSON.parse(p.variants || '{}') : (p.variants || {});
                                const vItems = Array.isArray(vJSON) ? vJSON : (vJSON.items || []);
                                if (Array.isArray(vItems) && vItems.length > 0) {
                                    vText = vItems.map(v => {
                                        const vStock = parseFloat(v.stock);
                                        const vStatus = (!isNaN(vStock) && vStock <= 0) ? '[OUT OF STOCK]' : '[IN STOCK]';
                                        const vPrice = v.price || p.price;
                                        const vTitle = v.type || v.name || v.value || 'Option';
                                        return `${vTitle}: ${vPrice} BDT ${vStatus}`;
                                    }).join(" | ");
                                }
                            } catch (e) { vText = p.variants || ""; }
                            
                            const varInfo = vText ? ` | VARIANT_SPECS_AND_STOCK: ${vText}` : "";
                            const attrInfo = p.ai_attributes && p.ai_attributes !== '{}' ? ` | HIGH_DENSITY_FACTS: ${p.ai_attributes}` : "";
                            let descriptionText = p.ai_summary || this.purifyText(p.full_description || p.description || '');
                            if (!detectedIntents.includes('PRODUCT_DETAILS_DEEP') && descriptionText.length > 120) {
                                descriptionText = descriptionText.slice(0, 120) + '...';
                            }
                            
                            return `- ${p.name} (SKU: ${p.sku || 'N/A'}, BASE_PRICE: ${p.price}${status}${varInfo}${attrInfo}): ${descriptionText}`;
                        }).join("\n") + "\n\n";
                } else if (allProducts.length === 0) {
                    productContext = "[PRODUCT CATALOG DATA]: [EMPTY CATALOG] The store product catalog is currently empty. Politely state that the catalog is currently empty or being updated.\n\n";
                } else {
                    productContext = "[PRODUCT CATALOG DATA]: [ITEM NOT IN CATALOG] The specific item/category requested by the customer is NOT in our active inventory. Politely state that we do not carry this item in our collection. IMPORTANT: Do NOT claim that in-stock catalog items are out of stock.\n\n";
                }
            }
        }

        // 5. Final Assembly with Intent Tag
        let context = `[DETECTED INTENT: ${detectedIntents.join(', ')}]\n\n` + persContext + pinnedContext + specificPolicyContext + companyOverviewContext + generalKnowledgeContext + productContext;
        
        // Critical Zero-Inference Safety injection
        context = "[SAFETY ALERT: DO NOT HALLUCINATE OR INVENT PRICES/VARIANTS. ONLY OFFER EXACT ITEMS AND VARIATIONS LISTED IN CATALOG DATA.]\n\n" + context;

        // 6. Always include Official Profile (Base Foundation)
        const profile = await dbUtils.getBusinessProfile();
        const isProfileDetailed = detectedIntents.some(i => ['STORE_LOCATION_INFO', 'POLICIES_RETURNS_EXCHANGE', 'GENERAL', 'OUT_OF_SCOPE'].includes(i));
        if (profile) {
            context += `[OFFICIAL PROFILE]:\n${this.getProfileText(profile, isProfileDetailed)}\n\n`;
        }

        return context || "No specific context found. Provide a professional, helpful response based on general company knowledge.";
    }

    async getUnifiedContext(query, number = null, limit = 5) {
        return this.getUnifiedContextWithEmb(query, number, null, limit);
    }

    // Performs semantic similarity search against the memory index
    async semanticSearchProductsWithEmb(queryEmbedding, limit = 5, threshold = 0.55) {
        if (!queryEmbedding || queryEmbedding.length === 0) return [];
        const queryVec = new Float32Array(queryEmbedding);
        const index = await this.getIndex();
        
        return index.products
            .filter(p => p.vec !== null)
            .map(p => ({ ...p, similarity: cosineSimilarity(queryVec, p.vec) }))
            .filter(p => p.similarity >= threshold)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    }

    async semanticSearchKnowledgeWithEmb(queryEmbedding, limit = 3, threshold = 0.15) {
        if (!queryEmbedding || queryEmbedding.length === 0) return [];
        const queryVec = new Float32Array(queryEmbedding);
        const index = await this.getIndex();
        
        return index.knowledge
            .map(d => ({ ...d, similarity: cosineSimilarity(queryVec, d.vec) }))
            .filter(d => d.similarity >= threshold)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    }

    async getSemanticCachedResponse(queryText, intent, tenantId = 'default', queryEmbedding = null) {
        try {
            const languageNeutralParser = require('./utils/languageNeutralParser');
            const analysis = languageNeutralParser.analyzeQueryIntent(queryText);

            if (analysis.isSystemTask || analysis.isDynamicMath || analysis.isContextDependent) {
                console.log(`[Cache-Guard] 🛑 Query type requires live processing (Math:${analysis.isDynamicMath}, Context:${analysis.isContextDependent}): "${queryText}". BYPASSING CACHE.`);
                return null;
            }

            const crypto = require('crypto');
            const cleanQuery = queryText.toLowerCase().replace(/[^\w\s\u0980-\u09FF]/gi, '').trim();
            const queryHash = crypto.createHash('md5').update(`${tenantId}_${cleanQuery}`).digest('hex');
            
            // 🔒 TIER 1: Exact Query Hash Match (Zero-Miss High Precision)
            const exactHit = await dbUtils.getCachedAIResponse(queryHash);
            if (exactHit && exactHit.response_text) {
                const liveHash = await dbUtils.getCatalogVersionHash();
                if (exactHit.is_golden || !exactHit.catalog_version_hash || exactHit.catalog_version_hash === liveHash) {
                    dbUtils.incrementCacheHit(exactHit.id);
                    console.log(`[Cache Hit] 🎯 Exact MD5 Hash Hit for: "${queryText}"`);
                    return JSON.parse(exactHit.response_text);
                } else {
                    await dbUtils.invalidateTenantCache(tenantId);
                }
            }
            
            // 🔒 TIER 2: High-Precision Vector Similarity Match (Dynamic Configurable Threshold, default 0.95)
            const thresholdStr = await dbUtils.getSetting('cache_similarity_threshold');
            const threshold = thresholdStr ? parseFloat(thresholdStr) : 0.95;

            if (queryEmbedding && queryEmbedding.length > 0) {
                const semanticHit = await this.findSemanticCacheHit(queryEmbedding, threshold);
                if (semanticHit && semanticHit.response_text) {
                    const liveHash = await dbUtils.getCatalogVersionHash();
                    if (semanticHit.is_golden || !semanticHit.catalog_version_hash || semanticHit.catalog_version_hash === liveHash) {
                        dbUtils.incrementCacheHit(semanticHit.id);
                        console.log(`[Cache Hit] 🎯 High-Precision Vector Match (>= ${threshold}) for: "${queryText}"`);
                        return JSON.parse(semanticHit.response_text);
                    } else {
                        await dbUtils.invalidateTenantCache(tenantId);
                    }
                }
            }

            return null;
        } catch (e) {
            console.error('[Cache-Guard Error]', e);
            return null;
        }
    }

    async setSemanticCachedResponse(queryText, intent, responseObj, tenantId = 'default') {
        try {
            // Skip caching for private personalized intents
            const NON_CACHEABLE_INTENTS = ['ORDER_CONFIRMATION_BUYING', 'ORDER_STATUS_TRACKING', 'DISCOUNT_NEGOTIATION', 'CRM_LIFECYCLE', 'CUSTOMER_SUPPORT_HANDOVER'];
            if (NON_CACHEABLE_INTENTS.includes(intent)) return;
            
            const crypto = require('crypto');
            const cleanQuery = queryText.toLowerCase().replace(/[^\w\s\u0980-\u09FF]/gi, '').trim();
            const queryHash = crypto.createHash('md5').update(`${tenantId}_${cleanQuery}`).digest('hex');
            const liveHash = await dbUtils.getCatalogVersionHash();
            
            await dbUtils.saveCachedAIResponse({
                queryHash: queryHash,
                pureQuery: queryText,
                responseText: JSON.stringify(responseObj),
                intentKey: intent,
                tenantId: tenantId,
                catalogVersionHash: liveHash,
                expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
            });
        } catch (e) {}
    }
}

module.exports = new VectorService();
