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
    }

    async generateEmbedding(text) {
        if (!text || text.trim() === '') return [];
        try {
            const result = await this.model.embedContent(text);
            return result.embedding.values;
        } catch (error) {
            console.error("Embedding Generation Error:", error.message);
            return [];
        }
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
        const variants = typeof product.variants === 'string' ? JSON.parse(product.variants || '{}') : (product.variants || {});
        let variantText = "";

        // Handle V3 Price Map if exists
        if (variants && variants.price_map && Object.keys(variants.price_map).length > 0) {
            variantText = Object.entries(variants.price_map)
                .map(([key, price]) => `${key}: ${price} BDT`)
                .join(", ");
        } else if (Array.isArray(variants.items)) {
            variantText = variants.items.map(v => `${v.type || v.name}: ${v.value || v.sku} (${v.price || product.price})`).join(", ");
        } else if (Array.isArray(variants)) {
            variantText = variants.map(v => `${v.type || v.name}: ${v.value || v.sku} (${v.price || product.price})`).join(", ");
        }

        const description = this.purifyText(product.full_description || product.description);

        return `Product: ${product.name} | Price: ${product.price || 'N/A'} | Options: ${variantText || 'Standard'} | Info: ${description}`;
    }

    getProfileText(profile) {
        const summary = [
            profile.company_name ? `Business: ${profile.company_name}` : "",
            profile.address ? `Address: ${profile.address}` : "",
            profile.about_text ? `About: ${this.purifyText(profile.about_text)}` : "",
            profile.shipping_policy ? `Shipping: ${this.purifyText(profile.shipping_policy)}` : "",
            profile.return_policy ? `Return/Refund: ${this.purifyText(profile.return_policy)}` : "",
            profile.operating_hours ? `Hours: ${profile.operating_hours}` : ""
        ].filter(Boolean).join(" | ");

        return summary;
    }

    getKnowledgeText(doc) {
        return `Category: ${doc.type} | Topic: ${doc.title} | Content: ${this.purifyText(doc.content)}`;
    }

    // --- Manual Sync Methods ---

    async syncProductsEmbeddings(onLog = null) {
        const log = (msg, type = 'info') => {
            console.log(msg);
            if (onLog) onLog(msg, type);
        };

        log("🔄 Manual Product Vector Sync Started...");
        const products = await dbUtils.getAIProducts({ limit: 10000 });
        let updated = 0;

        for (const product of products) {
            const text = this.getProductText(product);
            const emb = await this.generateEmbedding(text);
            if (emb && emb.length > 0) {
                await dbUtils.updateAIProduct(product.id, { embedding: JSON.stringify(emb) });
                updated++;
                log(`⚡ Vectorized: ${product.name}`, 'success');
            }
        }

        log(`✅ Product Sync Complete. Updated ${updated} items.`, 'success');
        return updated;
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

        log("🔄 Manual Knowledge Base Vector Sync Started...");
        const docs = await dbUtils.getKnowledgeDocuments();
        let updated = 0;

        for (const doc of docs) {
            const text = this.getKnowledgeText(doc);
            const emb = await this.generateEmbedding(text);
            if (emb && emb.length > 0) {
                await dbUtils.updateKnowledgeDocument(doc.id, { embedding: JSON.stringify(emb) });
                updated++;
                log(`⚡ Vectorized Fragment: ${doc.title}`, 'success');
            }
        }

        log(`✅ Knowledge Sync Complete. Updated ${updated} fragments.`, 'success');
        return updated;
    }

    // --- Unified Search & Context ---

    async getUnifiedContext(query, limit = 5) {
        const products = await this.semanticSearchProducts(query, 3);
        const knowledge = await this.semanticSearchKnowledge(query, 2);
        const profile = await dbUtils.getBusinessProfile(); // Profile is small, check it specifically if needed

        let context = "";

        if (profile.embedding) {
            const queryEmb = await this.generateEmbedding(query);
            const profEmb = JSON.parse(profile.embedding);
            const sim = cosineSimilarity(queryEmb, profEmb);
            if (sim > 0.4) {
                context += `BUSINESS INFO:\n${this.getProfileText(profile)}\n\n`;
            }
        }

        if (products.length > 0) {
            context += "RELEVANT PRODUCTS:\n";
            context += products.map(p => `- ${p.name} (${p.price}): ${this.purifyText(p.full_description || p.description)}`).join("\n") + "\n\n";
        }

        if (knowledge.length > 0) {
            context += "POLICIES & FAQ:\n";
            context += knowledge.map(k => `- ${k.title}: ${this.purifyText(k.content)}`).join("\n") + "\n\n";
        }

        return context || "No specific context found.";
    }

    // Performs semantic similarity search against the DB
    async semanticSearchProducts(query, limit = 5, threshold = 0.4) {
        const queryEmbedding = await this.generateEmbedding(query);
        if (queryEmbedding.length === 0) return [];

        const allProducts = await dbUtils.getAIProducts({ limit: 10000 });
        const results = [];

        for (const product of allProducts) {
            if (product.embedding && product.embedding !== 'null' && product.embedding.length > 10) {
                try {
                    const prodVector = JSON.parse(product.embedding);
                    const similarity = cosineSimilarity(queryEmbedding, prodVector);

                    if (similarity >= threshold) {
                        results.push({ ...product, similarity });
                    }
                } catch (e) {
                    console.error("Vector Parsing Error for product:", product.id);
                }
            }
        }

        return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    }

    async semanticSearchKnowledge(query, limit = 3, threshold = 0.4) {
        const queryEmbedding = await this.generateEmbedding(query);
        if (queryEmbedding.length === 0) return [];

        const docs = await dbUtils.getKnowledgeDocuments();
        const results = [];

        for (const doc of docs) {
            if (doc.embedding && doc.embedding !== 'null' && doc.embedding.length > 10) {
                try {
                    const docVector = JSON.parse(doc.embedding);
                    const similarity = cosineSimilarity(queryEmbedding, docVector);

                    if (similarity >= threshold) {
                        results.push({ ...doc, similarity });
                    }
                } catch (e) { }
            }
        }

        return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    }
}

module.exports = new VectorService();
