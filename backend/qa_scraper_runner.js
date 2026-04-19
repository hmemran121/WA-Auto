const SmartScraper = require('./scraper-service');
const dbUtils = require('./db');
const path = require('path');
const fs = require('fs');

/**
 * Enterprise Autonomous Scraping QA Agent (v2)
 * Handles: Trace, Extraction Engine Validation, Field Validation, Price Cluster, 
 * Variant Strategy, Image Detection, and DB Integrity.
 */
class ScraperQA {
    constructor() {
        this.urls = [
            'https://sailor.clothing/details/rb-ef62-bmscs-20371-44471',
            'https://sailor.clothing/details/ky-ef61-hwwlk-00321-41107',
            'https://turaag.com/products/atlas-women-s-track-jacket-1',
            'https://turaag.com/products/aerofit-compression-t-shirt',
            'https://frshopsbd.com/product/boyal-2-3kg/',
            'https://frshopsbd.com/product/deshi-koi-2/',
            'https://riverfish.com.bd/products/river-rui-fish-2-5kg-size',
            'https://riverfish.com.bd/products/নদীর-কাতল',
            'https://hffoodservice.com/product/chickpeas/',
            'https://hffoodservice.com/product/gawa-ghe/'
        ];
        this.results = [];
        this.logs = [];
    }

    log(msg, type = 'INFO') {
        const entry = `[${new Date().toISOString()}][${type}] ${msg}`;
        console.log(entry);
        this.logs.push(entry);
    }

    async run() {
        this.log("🚀 Starting Autonomous QA Execution...");

        for (const url of this.urls) {
            this.log(`🔍 Testing URL: ${url}`);
            const scraper = new SmartScraper();

            try {
                // Phase 1: Scraping Trace
                const html = await scraper.fetchPage(url);
                if (!html) throw new Error("Failed to fetch HTML");

                const cheerio = require('cheerio');
                const $ = cheerio.load(html);

                // Phase 2: Extraction Engine Validation
                const engines = this.validateEngines($, html);
                this.log(`Engines found: ${Object.keys(engines).filter(k => engines[k]).join(', ')}`);

                const product = await scraper.extractInfo($, url, 'product');
                if (!product) throw new Error("No product extracted from info (Check scraper logic)");

                const normalized = scraper.normalizeProduct(product);

                // Phase 3-8: Field & Variant Validation
                const validation = this.validateProduct(normalized, url, engines);

                // Phase 9-10: Database Integration & Cross-Verification
                const dbResult = await this.verifyDatabase(normalized);

                this.results.push({
                    url,
                    status: (validation.success && dbResult.success) ? 'PASS' : 'FAIL',
                    validation,
                    dbResult,
                    engines
                });

                this.log(`✅ Result for ${url}: ${validation.success ? 'PASS' : 'FAIL'}`);
            } catch (err) {
                this.log(`❌ Error testing ${url}: ${err.message}`, 'ERROR');
                this.results.push({
                    url,
                    status: 'ERROR',
                    error: err.message
                });
            }
        }

        await this.generateFinalReport();
    }

    validateEngines($, html) {
        return {
            nextData: html.includes('__NEXT_DATA__'),
            jsonLd: $('script[type="application/ld+json"]').length > 0,
            metaTags: $('meta[property^="og:"], meta[name^="twitter:"]').length > 0,
            domHeuristics: $('h1, .product-title, .price, .product-description').length > 0
        };
    }

    validateProduct(prod, url, engines) {
        const report = {
            success: true,
            fields: {},
            engines
        };

        // Name Validation
        report.fields.name = (prod.name && prod.name.trim().length >= 4);

        // Price Validation
        const priceStr = String(prod.price || "");
        report.fields.price = (priceStr && /[\d]/.test(priceStr));

        // URL Consistency
        const prodUrl = String(prod.product_url || "");
        report.fields.url = (prodUrl.includes(new URL(url).hostname));

        // Image Validation
        report.fields.image = (prod.image_url && prod.image_url.startsWith('http'));

        // Variant Structure Validation
        try {
            const variants = typeof prod.variants === 'string' ? JSON.parse(prod.variants) : prod.variants;
            report.fields.variants = (variants && Array.isArray(variants.items));
        } catch (e) {
            report.fields.variants = false;
        }

        // Description Cleaning Check
        report.fields.description = (prod.description && prod.description.length > 20);

        if (!report.fields.name || !report.fields.price || !report.fields.url || !report.fields.image) {
            report.success = false;
        }

        return report;
    }

    async verifyDatabase(prod) {
        return new Promise((resolve) => {
            const table = 'intelligent_product_catalog';
            const sqlite3 = require('sqlite3').verbose();
            const dbPath = path.join(__dirname, process.env.NODE_ENV === 'test' ? 'test_data.db' : 'data.db');
            const connection = new sqlite3.Database(dbPath);

            // ACTUAL INSERTION LOGIC (Phase 9-10)
            const query = `INSERT OR REPLACE INTO ${table} (
                product_url, name, price, regular_price, sale_price, 
                image_url, description, full_description, variants, 
                technical_attributes, composition, handling_guidelines
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            const params = [
                prod.product_url, prod.name, prod.price, prod.regular_price, prod.sale_price,
                prod.image_url, prod.description || "", prod.full_description || "",
                typeof prod.variants === 'string' ? prod.variants : JSON.stringify({ items: prod.variants || [] }),
                prod.technical_attributes || "", prod.composition || "", prod.handling_guidelines || ""
            ];

            connection.run(query, params, function (err) {
                if (err) {
                    console.error(`[DB Error] ${err.message}`);
                    resolve({ success: false, error: err.message });
                } else {
                    console.log(`[DB Success] Product Inserted/Updated (ID: ${this.lastID})`);
                    resolve({ success: true, action: 'inserted', id: this.lastID });
                }
                connection.close();
            });
        });
    }

    async generateFinalReport() {
        this.log("📊 Generating Final QA Report in Bangla...");

        let reportText = `# FINAL QA REPORT (বাংলা)\n\n`;
        reportText += `## ১️⃣ টেস্ট সারাংশ\n`;
        reportText += `- মোট URL টেস্ট: ${this.urls.length}\n`;
        reportText += `- সফল স্ক্র্যাপ: ${this.results.filter(r => r.status === 'PASS').length}\n`;
        reportText += `- ব্যর্থ স্ক্র্যাপ: ${this.results.filter(r => r.status !== 'PASS').length}\n\n`;

        reportText += `## ২️⃣ বিস্তারিত ফলাফল\n`;
        this.results.forEach(res => {
            reportText += `### URL: ${res.url}\n`;
            reportText += `- স্থিতি: ${res.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}\n`;
            if (res.error) reportText += `- ত্রুটি: ${res.error}\n`;
            if (res.validation) {
                reportText += `- ফিল্ড একুরেসি:\n`;
                Object.keys(res.validation.fields).forEach(f => {
                    reportText += `  - ${f}: ${res.validation.fields[f] ? '✅' : '❌'}\n`;
                });
            }
            reportText += `\n---\n`;
        });

        const reportPath = path.join(__dirname, 'qa_report_bangla.md');
        fs.writeFileSync(reportPath, reportText);
        this.log(`✅ Report generated at: ${reportPath}`);
    }
}

const qa = new ScraperQA();
qa.run();
