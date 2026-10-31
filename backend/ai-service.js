const { GoogleGenerativeAI } = require("@google/generative-ai");
const db = require('./db');
require('dotenv').config();

// Pricing Constants (USD per 1M tokens)
const PRICING = {
    'gemini-2.5-flash-lite': { input: 0.075, output: 0.30 },
    'gemini-2.5-flash': { input: 0.35, output: 1.05 },
    'gemini-1.5-flash': { input: 0.35, output: 1.05 },
    'gemini-1.5-pro': { input: 3.5, output: 10.5 },
    'default': { input: 0.5, output: 1.5 }
};

const CONTEXT_TOKEN_BUDGET = 8000;
const CHARS_PER_TOKEN_ESTIMATE = 3.5;

function truncateContext(context, budgetTokens = CONTEXT_TOKEN_BUDGET) {
    if (!context) return "";
    const maxChars = budgetTokens * CHARS_PER_TOKEN_ESTIMATE;
    if (context.length <= maxChars) return context;
    
    // Smart truncation — Pinned/Guaranteed data সবসময় রাখো
    const sections = context.split('\n\n');
    const priority = ['[GUARANTEED TRUTH', '[CUSTOMER PROFILE', '[OFFICIAL PROFILE'];
    
    let result = '';
    for (const p of priority) {
        const sec = sections.find(s => s.startsWith(p));
        if (sec) result += sec + '\n\n';
    }
    for (const sec of sections) {
        if (result.length + sec.length < maxChars && !priority.some(p => sec.startsWith(p))) {
            result += sec + '\n\n';
        }
    }
    return result;
}

function extractIntelRobust(text) {
    let match = text.match(/\[INTEL:\s*({[\s\S]*?})\]/);
    if (match) {
        try { return JSON.parse(match[1]); } catch {}
    }
    const lastBrace = text.lastIndexOf('{');
    const lastEnd = text.lastIndexOf('}');
    if (lastBrace > -1 && lastEnd > lastBrace) {
        try { return JSON.parse(text.slice(lastBrace, lastEnd + 1)); } catch {}
    }
    try {
        const relaxed = text.match(/\[INTEL:\s*(.+)\]/s);
        if (relaxed) return JSON.parse(relaxed[1].replace(/'/g, '"').replace(/,\s*}/g, '}'));
    } catch {}
    return null;
}

/**
 * Intelligent Brain Manager
 * Fetches an active API key, handles failover if needed.
 */
const getBrain = async () => {
    try {
        const configs = await db.getActiveAIConfigs();
        if (!configs || configs.length === 0) {
            console.warn("[Brain] No active configs in DB. Using .env fallback.");
            if (process.env.GEMINI_API_KEY) {
                return [{
                    id: null,
                    name: 'Environment Key',
                    api_key: process.env.GEMINI_API_KEY,
                    model: 'gemini-2.5-flash-lite',
                    provider: 'google'
                }];
            }
            throw new Error("No AI API configurations available.");
        }
        return configs;
    } catch (e) {
        console.error("[Brain] Error fetching configs:", e);
        throw e;
    }
};

/**
 * Logs detailed metrics after AI call
 */
const handleLogging = async (config, purpose, result, latency) => {
    try {
        const { inputTokens, outputTokens, finalOutput, metadata } = result;
        
        // Calculate costs
        const price = PRICING[config.model] || PRICING.default;
        const inputCost = (inputTokens / 1000000) * price.input;
        const outputCost = (outputTokens / 1000000) * price.output;
        const totalCost = inputCost + outputCost;

        const baselineInputTokens = 2100;
        const tokensSaved = Math.max(0, baselineInputTokens - (inputTokens || 0));

        await db.logAIInteraction({
            customer_number: metadata?.customer_number || 'SYSTEM',
            user_query: metadata?.query || `Task: ${purpose}`,
            ai_response: typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput),
            context_used: metadata?.context || null,
            confidence_score: metadata?.confidence || 1.0,
            is_handover: metadata?.handover || 0,
            intel: metadata?.intel || null,
            api_config_id: config.id,
            purpose,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens,
            cost: totalCost,
            latency,
            detected_intent: metadata?.detected_intent || 'GENERAL',
            tokens_saved: tokensSaved
        });
        
        // Update usage count for the key
        if (config.id) {
            await db.updateAIConfig(config.id, { usage_count: (config.usage_count || 0) + 1 });
        }
    } catch (e) {
        console.error("[Logging Manager Fail]", e);
    }
};

/**
 * Utility for retrying transient network/API errors with exponential backoff
 */
const withRetry = async (fn, maxRetries = 4, initialDelay = 1500) => {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;
            const msg = e.message || '';
            const isRetryable = 
                msg.includes('fetch failed') || 
                msg.includes('ECONNRESET') || 
                msg.includes('network') ||
                msg.includes('503') || 
                msg.includes('Service Unavailable') ||
                msg.includes('429') || 
                msg.includes('QUOTA');

            if (!isRetryable) throw e; // Non-retryable errors are handled by Failover logic
            
            // For 503/Service Unavailable, we use a more aggressive backoff
            const isHighDemand = msg.includes('503') || msg.includes('Service Unavailable');
            const baseDelay = isHighDemand ? 3000 : initialDelay;
            const delay = baseDelay * Math.pow(2, i);
            
            console.warn(`[AI-Retry] Transient error detected (${isHighDemand ? '503 High Demand' : 'Network/Quota'}). Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
};

/**
 * Execute AI Task with intelligent failover and network retries
 */
const executeAITask = async (taskName, logicFn) => {
    const configs = await getBrain();
    let lastError = null;
    const startTime = Date.now();

    for (const config of configs) {
        try {
            const genAI = new GoogleGenerativeAI(config.api_key);
            const model = genAI.getGenerativeModel({ model: config.model || "gemini-2.5-flash-lite" });
            
            // Wrap the logic in a specialized retry handler for each config
            const result = await withRetry(() => logicFn(model, config));
            
            const latency = Date.now() - startTime;

            // Handle usage logging (Background)
            handleLogging(config, taskName, result, latency).catch(e => console.error("[Logging Error]", e));

            // If failover happened and was successful, make this the primary
            if (config.id && configs[0].id !== config.id) {
                console.log(`[Brain] Failover successful. Promoting ${config.name} to Primary.`);
                await db.updateAIConfig(config.id, { is_primary: 1 });
            }

            console.log(`[Brain] Task "${taskName}" completed successfully via ${config.name}.`);
            return result.finalOutput;
        } catch (e) {
            lastError = e;
            const msg = e.message || '';
            console.error(`[Brain] Task "${taskName}" failed with ${config.name}: ${msg}`);
            
            // Intelligent Status Management:
            // Don't mark as 'error' if it's just a transient service issue
            if (config.id) {
                const isQuota = msg.includes('429') || msg.includes('QUOTA') || msg.includes('rate limit');
                const isTransient = msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('high demand');
                const isAuth = msg.includes('401') || msg.includes('API_KEY_INVALID') || msg.includes('key not found');

                if (isAuth) {
                    console.error(`[Brain] ❌ Authentication failure for ${config.name}. Disabling key.`);
                    db.setAIConfigStatus(config.id, 'error', `Auth Failure: ${msg}`);
                } else if (isQuota) {
                    console.warn(`[Brain] ⛔ Quota exceeded for ${config.name}. Marking as limit exceeded.`);
                    db.setAIConfigStatus(config.id, 'limit_exceeded', `Quota hit: ${msg}`);
                } else if (!isTransient) {
                    // Only mark as general error if it's NOT a transient 503 issue
                    console.error(`[Brain] ❌ Unexpected error for ${config.name}. Marking as error.`);
                    db.setAIConfigStatus(config.id, 'error', msg);
                } else {
                    console.log(`[Brain] ⏳ Transient issue (503) for ${config.name}. Skipping without disabling.`);
                }
            }
            
            continue;
        }
    }

    throw new Error(`AI System Exhausted. All retries failed. Last Error: ${lastError?.message}`);
};

const generateTemplate = async (prompt, category = 'General', useSpintax = false) => {
    return executeAITask('template_generation', async (model, config) => {
        let spintaxInstruction = "";
        if (useSpintax) {
            spintaxInstruction = `
        - USE SPINTAX FORMAT for greetings, sign-offs, and key action words.
        - Spintax format: {option1|option2|option3}.`;
        }

        const systemPrompt = `You are a professional WhatsApp marketing expert. 
        Generate a compelling message template for: "${prompt}".
        Category: ${category}.${spintaxInstruction}
        Respond ONLY with the message body.`;

        const inputTokens = await model.countTokens(systemPrompt);
        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const text = response.text().trim();
        const outputTokens = await model.countTokens(text);

        return {
            finalOutput: text,
            inputTokens: inputTokens.totalTokens,
            outputTokens: outputTokens.totalTokens,
            metadata: { query: prompt }
        };
    });
};

const generateSmartReply = async ({ context, history, userMessage, businessName, customerNumber }) => {
    return executeAITask('auto_reply', async (model, config) => {

        // ── Dynamic Config Loading (Zero Hardcode Architecture) ─────────────
        const [
            taggingRulesResult,
            aiPersonaResult,
            aiToneGuideResult,
            aiFunnelRulesResult,
            aiStage3TemplateResult,
            businessProfileResult,
            aiCustomInstructionsResult,
        ] = await Promise.allSettled([
            db.getSetting('ai_tagging_rules'),
            db.getSetting('ai_persona'),
            db.getSetting('ai_tone_guide'),
            db.getSetting('ai_funnel_rules'),
            db.getSetting('ai_stage3_template'),
            db.getBusinessProfile(),
            db.getSetting('ai_custom_instructions'),
        ]);

        const getValue = (settled, fallback) =>
            settled.status === 'fulfilled' && settled.value ? settled.value : fallback;

        const aiCustomInstructions = getValue(aiCustomInstructionsResult, '');

        const profile = getValue(businessProfileResult, {});

        // ── Business Operational Config (from DB — NOT hardcoded) ───────────
        const deliveryInside    = profile.delivery_charge_inside  || 'Contact us for details';
        const deliveryOutside   = profile.delivery_charge_outside || 'Contact us for details';
        const deliveryTimeframe = profile.delivery_timeframe      || 'N/A';
        const paymentMethods    = profile.payment_methods         || 'N/A';
        const returnPolicy      = profile.return_policy           || 'N/A';
        const refundPolicy      = profile.refund_policy           || 'N/A';
        const exchangePolicy    = profile.exchange_policy         || 'N/A';
        const operatingHours    = profile.operating_hours         || 'N/A';
        const businessAddress   = profile.address                 || 'N/A';
        const contactPhone      = profile.contact_phone           || 'N/A';
        const contactEmail      = profile.contact_email           || 'N/A';
        const websiteUrl        = profile.main_website_url        || 'N/A';
        const bizName           = businessName || profile.company_name || 'our business';

        // ── AI Behavior Rules (from DB with smart fallbacks) ────────────────
        const taggingRules = getValue(taggingRulesResult,
            '1. Assign #HighValue if strong purchase intent is detected.\n' +
            '2. Assign #PriceSensitive if they negotiate or ask for discounts.\n' +
            '3. Assign #Returning if they mention or reference previous orders.'
        );

        const aiPersona = getValue(aiPersonaResult,
            `You are a world-class senior sales representative for "${bizName}". ` +
            `You are professional, empathetic, knowledgeable, and focused on delivering a premium customer experience.`
        );

        const aiToneGuide = getValue(aiToneGuideResult,
            `- Sound like a real, warm human — never robotic or template-like.
           - Automatically detect and match the customer's language (Bangla, English, or mixed).
           - Use emojis naturally and sparingly.
           - Be concise. Don't repeat information unnecessarily.
           - Never use time-stamps or filler words like "today" / "আজ" unless the customer used them first.`
        );

        const aiFunnelRules = getValue(aiFunnelRulesResult,
            `STAGE 1 — BROWSING (Customer is exploring):
             - Customer asks about price, size, color, availability, or product details.
             - Action: Provide ONLY the requested info. Close with a friendly open-ended question to keep dialogue flowing.
             - FORBIDDEN: Do NOT ask for Name, Address, or Phone Number at this stage.

           STAGE 2 — BUYING INTENT (Customer wants to order):
             - Triggered by: "অর্ডার করবো", "how to order", "I want this", or confirming a item/size/quantity.
             - CART REVIEW & DISAMBIGUATION:
               * Explicit Items: If customer explicitly selected specific items (e.g. "আমি ২ কেজি ইলিশ আর ১টি রুই নিব"), summarize ONLY those items.
               * Multi-Item Browsing: If customer asked about 3+ items without confirming which ones to buy, do NOT bill all items. List the discussed items clearly and ask: "আপনার পছন্দ করা এই আইটেমগুলোর মধ্যে কোন কোনগুলো এবং কত পরিমাণ অর্ডার কনফার্ম করতে চাচ্ছেন?"
               * Item Exclusions: If customer says "X বাদ দাও" or "X লাগবে না", immediately remove X from order.
             - Action: Summarize chosen items + quantities. State shipping charges (${deliveryInside} / ${deliveryOutside}). Ask for Full Name, Address, Phone.

           STAGE 3 — FINAL CONFIRMATION (All details collected):
             - Present clean order review. Ask for explicit final confirmation.
             - ONLY append [ACTION: PLACE_ORDER] when customer says "Yes", "Confirm", "অর্ডার কনফার্ম করো" or equivalent affirmation.`
        );

        const aiStage3Template = getValue(aiStage3TemplateResult,
            `Please review your order before I confirm:\n` +
            `📦 Items: [LIST_ITEMS]\n` +
            `💰 Total: [TOTAL_AMOUNT] (shipping included)\n` +
            `📍 Address: [DELIVERY_ADDRESS]\n` +
            `📞 Phone: [PHONE]\n\n` +
            `Shall I go ahead and confirm this order?`
        );

        // ── Extract Detected Intent early for Modular Prompt Construction ─────
        const intentMatch = (context || '').match(/\[DETECTED INTENT:\s*([^\]]+)\]/);
        const detectedIntent = intentMatch ? intentMatch[1].trim() : 'GENERAL';

        const isPolicyOrGeneralIntent = ['POLICIES_RETURNS_EXCHANGE', 'PAYMENT_METHODS_DETAILS', 'STORE_LOCATION_INFO', 'LOCATION_COVERAGE', 'GENERAL', 'OUT_OF_SCOPE'].some(i => detectedIntent.includes(i));
        const isOrderIntent = ['ORDER_CONFIRMATION_BUYING', 'ORDER_MODIFICATION_CANCEL', 'GENERAL'].some(i => detectedIntent.includes(i));

        const operationalRulesBlock = isPolicyOrGeneralIntent ? `
═══ BUSINESS OPERATIONAL RULES ═══
- Payment Methods  : ${paymentMethods}
- Return Policy    : ${returnPolicy}
- Refund Policy    : ${refundPolicy}
- Exchange Policy  : ${exchangePolicy}
- Operating Hours  : ${operatingHours}
- Store Address    : ${businessAddress}
- Contact Phone    : ${contactPhone}
- Contact Email    : ${contactEmail}
- Website          : ${websiteUrl}
- Social Media     : ${profile.social_links || 'N/A'}
` : '';

        const stage3TemplateBlock = isOrderIntent ? `
3. ORDER CONFIRMATION TEMPLATE (Stage 3 only):
${aiStage3Template}
` : '';

        const crmTaggingBlock = isOrderIntent ? `
═══ INTELLIGENCE TASK ═══
Detect CRM signals based on these rules:
${taggingRules}
` : '';

        const customInstructionsBlock = aiCustomInstructions ? `
═══ CUSTOM BUSINESS INSTRUCTIONS & GUIDELINES ═══
${aiCustomInstructions}
` : '';

        const funnelRulesBlock = isOrderIntent ? aiFunnelRules : `Customer is exploring/asking info. Provide requested details warmly. Do NOT ask for address/phone at this stage.`;

        // ── Dynamic Math & Entity Detection (Domain Agnostic - Zero Hardcoding) ──
        const DYNAMIC_MATH_PATTERN = /(\d+(\.\d+)?\s*(kg|কেজি|gm|গ্রাম|পিস|টি|প্যাক|কেজির|টাকা|হিসাব|দাম কত|মোট কত)|হিসাব|ক্যালকুলেট)/i;
        const isMathQuery = DYNAMIC_MATH_PATTERN.test(userMessage);

        const mathInstructionBlock = isMathQuery ? `\n═══ DYNAMIC CALCULATION DIRECTIVE ═══\nThe customer is asking for a specific quantity, weight, or calculated total (e.g., 6.5 kg, custom units, or item price math).\n1. Inspect the exact product pricing and tiers in the context below.\n2. Dynamically calculate the exact price (Weight/Quantity * Rate per unit).\n3. State the exact calculated total sum clearly in BDT without outputting generic product list catalog text.\n` : '';

        const intelDirective = isOrderIntent 
            ? '4. ALWAYS append: [INTEL: {"tags": [...], "lifecycle_stage": "lead|prospect|customer", "sentiment": 0-100, "extract": {"name": "...", "address": "...", "phone": "...", "items": [{"id": 0, "name": "...", "qty": 1, "price": 0}], "total_amount": 0}}]'
            : '4. ALWAYS append: [INTEL: {"tags": ["product_inquiry"], "lifecycle_stage": "lead", "sentiment": 50, "extract": {"name": null, "address": null, "phone": null, "items": [], "total_amount": 0}}]';

        // ── Assembled System Prompt (100% Dynamic & Ultra-Lean) ──────────────
        const systemPrompt = `${aiPersona}

═══ CORE PROTOCOLS ═══

1. STRICT ACCURACY & CONVERSATION CART MEMORY:
   - ONLY discuss products, prices, and policies found in the provided context below.
   - NEVER fabricate prices, stock levels, or policies.
   - MULTI-ITEM CART ACCUMULATION: When a customer asks to order or confirm an order ("অর্ডার করব/অর্ডার কনফার্ম করতে চাই"), inspect the FULL CONVERSATION HISTORY. COMBINE ALL products/items agreed upon or requested throughout the conversation into the order summary and calculate the combined total sum, unless the customer explicitly cancelled an item.
   - INVENTORY LISTING: When asked what varieties exist, list ALL matching in-stock items.

2. CONCISE & POLISHED RESPONSE FORMATTING:
   - NO UNWANTED CROSS-SELLING: Do NOT pitch unrelated product categories when a customer asks about a specific item, unless explicitly requested.
   - NO RE-EXPLAINING CONFIRMED SPECIFICATIONS: Once the customer selects a specific size/tier/quantity, do NOT re-explain the menu or pricing tier rules. Provide a clean, crisp price calculation directly without wordy robotic preambles.
   - Keep answers warm, short, elegant, and structured with clean bullet points.

3. SALES FUNNEL DIRECTIVE:
${funnelRulesBlock}
${stage3TemplateBlock}
4. COMMUNICATION STYLE:
${aiToneGuide}
${customInstructionsBlock}${operationalRulesBlock}${crmTaggingBlock}${mathInstructionBlock}
═══ KNOWLEDGE BASE & PRODUCT CONTEXT ═══
${truncateContext(context)}

═══ CONVERSATION HISTORY ═══
${history || 'No previous history.'}

═══ CURRENT CUSTOMER MESSAGE ═══
"${userMessage}"

═══ OUTPUT RULES (STRICTLY FOLLOW) ═══
1. Write ONLY the reply text. No meta-commentary, no headers, no preamble.
2. Do NOT output internal reasoning notes, self-corrections, or meta-comments in parentheses.
3. Append intelligence block on a new line at the very end (it will be auto-stripped).
4. If confirming a final order: append [ACTION: PLACE_ORDER]
${intelDirective}`;

        // ── Intent-Scoped History Sanitizer for Tier 1 Catalog Queries ───────────
        let sanitizedHistory = history || 'No previous history.';
        const isTier1Catalog = (context || '').includes('[PRODUCT CATALOG DATA - TIER 1 ROOT OVERVIEW]') || detectedIntent === 'FULL_CATALOG_OVERVIEW';
        if (isTier1Catalog && sanitizedHistory !== 'No previous history.') {
            // Strip verbose variant breakdown tables from past AI turns in history to prevent history bleed
            sanitizedHistory = sanitizedHistory
                .split('\n')
                .map(line => {
                    if (line.startsWith('AI:')) {
                        // Strip detailed sub-bullet variant specs from history line
                        return line.replace(/(\*|\-)\s*[^:\n]+:\s*\d+\s*(টাকা|BDT)[\s\S]*/gi, '').trim();
                    }
                    return line;
                })
                .filter(Boolean)
                .join('\n');
        }

        // ── Semantic Cache Check (10ms Latency, 0 Tokens) ─────────────────────
        const vectorService = require('./vector-service');
        const cachedHit = await vectorService.getSemanticCachedResponse(userMessage, detectedIntent, 'default');
        if (cachedHit) {
            return {
                finalOutput: cachedHit,
                inputTokens: 0,
                outputTokens: 0,
                metadata: {
                    customer_number: customerNumber,
                    query: userMessage,
                    context: '[SEMANTIC CACHE HIT]',
                    handover: cachedHit.handover ? 1 : 0,
                    intel: cachedHit.intel,
                    detected_intent: detectedIntent
                }
            };
        }

        const inputTokens = await model.countTokens(systemPrompt);
        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const textToReturn = response.text().trim();
        const outputTokens = await model.countTokens(textToReturn);

        const isHandover = textToReturn.includes('[HANDOVER]');
        const actionMatch = textToReturn.match(/\[ACTION: (\w+)\]/);
        const actionTag = actionMatch ? actionMatch[1] : null;

        let intel = extractIntelRobust(textToReturn);

        // Robust multi-step cleaning — INTEL NEVER leaks into reply
        let cleanMessage = textToReturn;
        cleanMessage = cleanMessage.replace(/\[INTEL:[\s\S]*$/gi, '');
        cleanMessage = cleanMessage.replace(/\[HANDOVER\]/gi, '');
        cleanMessage = cleanMessage.replace(/\[ACTION:\s*\w+\]/gi, '');
        cleanMessage = cleanMessage.replace(/,?\s*"total_amount"[\s\S]*/gi, '');
        cleanMessage = cleanMessage.replace(/,?\s*"extract"[\s\S]*/gi, '');
        cleanMessage = cleanMessage.replace(/[,\s\}\]]+$/g, '');
        cleanMessage = cleanMessage.trim();

        const finalOutputObj = {
            reply: cleanMessage,
            handover: isHandover,
            action: actionTag,
            intel: intel,
            detected_intent: detectedIntent
        };

        // Cache the clean response asynchronously for future queries
        vectorService.setSemanticCachedResponse(userMessage, detectedIntent, finalOutputObj, 'default').catch(() => {});

        return {
            finalOutput: finalOutputObj,
            inputTokens: inputTokens.totalTokens,
            outputTokens: outputTokens.totalTokens,
            metadata: {
                customer_number: customerNumber,
                query: userMessage,
                context,
                handover: isHandover ? 1 : 0,
                intel: intel,
                detected_intent: detectedIntent
            }
        };
    });
};

const summarizeHistory = async (history, currentSummary = "") => {
    return executeAITask('summarization', async (model, config) => {
        const systemPrompt = `You are an "Information Architect & Memory Manager". 
        Your job is to update a cumulative summary of a customer conversation.
        
        GOAL: Maintain a high-density record of every critical fact mentioned, so no data is lost when raw chat history is truncated.
        
        PRIORITY DATA (MANDATORY TO TRACK):
        1. IDENTITY: Name, confirmed location/address, verified phone/email.
        2. QUOTATIONS: Every product discussed and the EXACT price/discount quoted.
        3. LOGISTICS: Delivery preferences, payment status, and agreed timelines.
        4. INTENT: Why the customer is buying and their current stage (Comparing/Ready to Order/Paid).
        
        RULES:
        - CUMULATIVE: Integrate new facts from the current HISTORY into the PREVIOUS summary.
        - NO FLUFF: Remove all greetings, social chatter, and redundant explanations.
        - STRUCTURED: Use a punchy, high-density format.
        
        PREVIOUS SUMMARY: 
        ${currentSummary || 'None. This is a new conversation.'}
        
        NEW CHAT HISTORY (RAW):
        ${history}
        
        OUTPUT:
        Provide ONLY the updated, consolidated summary. Do not include preambles.`;

        const inputTokens = await model.countTokens(systemPrompt);
        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const text = response.text().trim();
        const outputTokens = await model.countTokens(text);

        return {
            finalOutput: text,
            inputTokens: inputTokens.totalTokens,
            outputTokens: outputTokens.totalTokens
        };
    });
};

const generateIntelligenceBrief = async (stats) => {
    return executeAITask('intel_brief', async (model, config) => {
        const systemPrompt = `Analyze stats and provide a 1-sentence growth advice.
        STATS: ${JSON.stringify(stats)}`;

        const inputTokens = await model.countTokens(systemPrompt);
        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const text = response.text().trim();
        const outputTokens = await model.countTokens(text);

        return {
            finalOutput: text,
            inputTokens: inputTokens.totalTokens,
            outputTokens: outputTokens.totalTokens
        };
    });
};

const tuneProfileOverview = async (rawText) => {
    if (!rawText) return "";
    return executeAITask('profile_tuning', async (model, config) => {
        const systemPrompt = `Rewrite professionally (max 4 sentences): "${rawText}"`;
        const inputTokens = await model.countTokens(systemPrompt);
        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const text = response.text().trim();
        const outputTokens = await model.countTokens(text);

        return {
            finalOutput: text,
            inputTokens: inputTokens.totalTokens,
            outputTokens: outputTokens.totalTokens
        };
    });
};

const tuneKnowledge = async (rawText) => {
    if (!rawText) return { finalOutput: "" };
    return executeAITask('knowledge_tuning', async (model, config) => {
        const systemPrompt = `You are an "Information Architect". 
        Optimize the following raw text into a high-density, professional knowledge fragment.
        
        GOALS:
        1. REMOVE: Filler, marketing fluff, redundant words, and greetings.
        2. STRUCTURE: Use clear, punchy sentences.
        3. DENSITY: Maximize information per character.
        4. CLARITY: Ensure it's easy for another AI to use this as context for customer support.
        5. LANGUAGE: Keep original language (Bengali or English).
        
        RAW TEXT:
        "${rawText}"
        
        OUTPUT:
        Return ONLY the optimized text. No preamble, no explanation.`;
        
        const inputTokens = await model.countTokens(systemPrompt);
        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const text = response.text().trim();
        const outputTokens = await model.countTokens(text);

        return {
            finalOutput: text,
            inputTokens: inputTokens.totalTokens,
            outputTokens: outputTokens.totalTokens
        };
    });
};

module.exports = { 
    generateTemplate, 
    generateAutoReply: generateSmartReply, 
    summarizeHistory, 
    generateIntelligenceBrief, 
    tuneProfileOverview,
    tuneKnowledge,
    withRetry
};
