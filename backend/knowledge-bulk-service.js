const axios = require('axios');
const cheerio = require('cheerio');
const dbUtils = require('./db');
const { GoogleGenerativeAI } = require("@google/generative-ai");

class KnowledgeBulkService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }

    /**
     * Parse CSV manually to avoid adding dependencies
     * Assumes headers: title, content, type (optional), action_tag (optional), media_url (optional)
     */
    async processCSV(csvText, onProgress = null) {
        const lines = csvText.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) throw new Error("CSV is empty or missing data.");

        const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
        const dataLines = lines.slice(1);
        let imported = 0;

        for (let i = 0; i < dataLines.length; i++) {
            const row = dataLines[i].split(',').map(val => val.trim());
            const doc = {};
            headers.forEach((h, idx) => {
                doc[h] = row[idx];
            });

            if (doc.title && doc.content) {
                await dbUtils.addKnowledgeDocument({
                    title: doc.title,
                    content: doc.content,
                    type: doc.type || 'faq',
                    action_tag: doc.action_tag || '',
                    media_url: doc.media_url || '',
                    media_type: doc.media_type || 'image',
                    is_pinned: 1,
                    pinned_items: []
                });
                imported++;
            }

            if (onProgress) {
                onProgress(`Processed ${i + 1}/${dataLines.length}: ${doc.title || 'Unknown'}`, 'info', i + 1, dataLines.length);
            }
        }

        return imported;
    }

    /**
     * Scrape a URL and use AI to create knowledge fragments
     */
    async scrapeWebsiteToKnowledge(url, processId, onProgress = null) {
        const log = (msg, type = 'info', current = 0, total = 0) => {
            if (onProgress) onProgress(msg, type, current, total);
        };

        log(`🌐 Connecting to ${url}...`, 'info', 10, 100);

        try {
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                timeout: 15000
            });

            const $ = cheerio.cheerio ? cheerio : cheerio.load(response.data);
            
            // Strip junk
            $('script, style, nav, footer, header, noscript, iframe').remove();
            
            const title = $('title').text() || url;
            const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

            if (bodyText.length < 100) {
                throw new Error("Page content too short to extract meaningful knowledge.");
            }

            log(`🧠 AI is analyzing ${bodyText.length} characters of raw data...`, 'info', 40, 100);

            const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const prompt = `
                I have extracted text from a website: "${url}".
                Please analyze this text and break it down into a list of concise "Knowledge Fragments" for an AI chatbot.
                Each fragment should be a separate piece of information (like a policy, a specific fact, or an FAQ).
                
                Format your response AS A VALID JSON ARRAY of objects:
                [{ "title": "...", "content": "...", "type": "faq|policy|general" }]
                
                Limit it to the most important top 10 fragments. 
                Ensure content is clear and accurate based on the source.
                
                RAW DATA:
                ${bodyText.slice(0, 10000)}
            `;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            
            // Clean markdown JSON wrapper
            const jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const fragments = JSON.parse(jsonStr);

            log(`✨ AI generated ${fragments.length} intelligence nodes. Archiving...`, 'success', 70, 100);

            for (let i = 0; i < fragments.length; i++) {
                const frag = fragments[i];
                await dbUtils.addKnowledgeDocument({
                    title: frag.title,
                    content: frag.content,
                    type: frag.type || 'general',
                    is_pinned: 1,
                    pinned_items: []
                });
                log(`📦 Saved: ${frag.title}`, 'success', 70 + (i * 2), 100);
            }

            log(`✅ Success! ${fragments.length} fragments added from ${url}.`, 'success', 100, 100);
            return fragments.length;

        } catch (e) {
            log(`❌ Scrape Failed: ${e.message}`, 'error', 100, 100);
            throw e;
        }
    }
}

module.exports = new KnowledgeBulkService();
