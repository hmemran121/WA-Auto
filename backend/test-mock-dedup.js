const dbUtils = require('./db');
const CrawlerService = require('./crawler-service');

(async () => {
    // We instantiate crawler to use its exact onProduct logic (by mocking a scan callback)
    const scraper = require('./scraper-service');
    // But actually, the onProduct logic is defined anonymously inside runBackgroundCrawl
    // Let's just run it manually:
    const crawler = new CrawlerService();
    // We can't easily extract onProduct, so let's just trigger it:
    
    // V14.5: Advanced Variant Grouping (Base Name Extraction)
    const KNOWN_COLORS = new Set(['blue', 'coral', 'pink', 'lavender', 'heather', 'green', 'olive']);
    function getBaseNamePattern(name) {
        if (!name) return name;
        let words = name.split(/\s+/);
        if (words[words.length - 1].includes('-')) {
            let parts = words[words.length - 1].split('-');
            if (KNOWN_COLORS.has(parts[parts.length - 1].toLowerCase())) {
                parts.pop();
                words[words.length - 1] = parts.join('-');
                if (!words[words.length - 1]) words.pop();
            }
        }
        while (words.length > 2) {
            let lastWord = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '');
            if (KNOWN_COLORS.has(lastWord)) {
                words.pop();
            } else {
                break;
            }
        }
        return words.join(' ').trim();
    }

    const products = [
        { name: 'Flex 360 Leggings Coral Blue', price: '1200', product_url: 'http://turaag.com/flex-1', sku: 'SKU-001' },
        { name: 'Flex 360 Leggings Pink', price: '1200', product_url: 'http://turaag.com/flex-2', sku: 'SKU-002' },
        { name: 'Go Easy T-shirt Olive Green Heather', price: '900', product_url: 'http://turaag.com/tshirt-1', sku: 'SKU-003' },
        { name: 'Go Easy T-shirt Mid Gray Heather', price: '900', product_url: 'http://turaag.com/tshirt-2', sku: 'SKU-004' } // Wait, 'gray' not in my KNOWN_COLORS mock but it's in actual DB
    ];

    for (let prod of products) {
        const baseName = getBaseNamePattern(prod.name);
        const existingByBase = await dbUtils.getAIProducts({ base_name: baseName });
                        
        let existing = existingByBase.find(p => p.name.startsWith(baseName));
        if (existing) {
            console.log('? MERGED:', prod.name, '=> into =>', existing.name);
        } else {
            console.log('?? ADDED: ', prod.name, '(Base:', baseName, ')');
            await dbUtils.addAIProduct({
                name: prod.name,
                product_url: prod.product_url,
                price: prod.price,
                sku: prod.sku,
                source: 'scraper'
            });
        }
    }
    process.exit(0);
})();
