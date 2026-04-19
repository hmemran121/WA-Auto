const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

// Add stealth plugin to playwright-extra
chromium.use(stealth);

class ScraperDriver {
    constructor() {
        this.browser = null;
    }

    async init() {
        if (!this.browser) {
            this.browser = await chromium.launch({
                headless: true,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            });
        }
    }

    async fetchDynamicPage(url, timeout = 30000) {
        if (!this.browser) await this.init();

        const context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 }
        });

        // Apply stealth to the context
        // Note: playwright-stealth is often used as a plugin, 
        // but here we manually handle some evasions if needed or use the package correctly.
        // If playwright-stealth exports a function:
        // await stealth(context); 

        const page = await context.newPage();
        
        try {
            console.log(`[Driver] 🌐 Navigating to (Dynamic): ${url}`);
            
            // Set reasonable timeout
            await page.goto(url, { 
                waitUntil: 'networkidle', 
                timeout 
            });

            // Wait for a bit more if it's a slow hydration site
            await page.waitForTimeout(2000);

            // Auto-scroll to trigger lazy loading
            await this.autoScroll(page);

            const html = await page.content();
            await context.close();
            return html;
        } catch (error) {
            console.error(`[Driver] ❌ Error fetching dynamic page: ${error.message}`);
            await context.close();
            return null;
        }
    }

    async autoScroll(page) {
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                let distance = 100;
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight || totalHeight > 5000) { // Limit scroll to 5000px
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

module.exports = new ScraperDriver();
