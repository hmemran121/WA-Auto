const SmartScraper = require('./scraper-service');

async function testDiscovery() {
    const scraper = new SmartScraper();
    const url = 'https://frshopsbd.com/';

    console.log(`Starting diagnostic scan for ${url}...`);

    await scraper.scan(url, { maxPages: 200, isApiSync: true }, (update) => {
        if (update.message) console.log(`[Update] ${update.message}`);
        if (update.current) console.log(`[Progress] ${update.current}/${update.total} (Products: ${update.productCount})`);
    });

    console.log('\n--- Discovery Results ---');
    console.log(`Total Visited: ${scraper.visited.size}`);
    console.log(`Total Products Found: ${scraper.data.products.length}`);
    console.log(`Discovered Product URLs (Sample 5):`);
    scraper.data.products.slice(0, 5).forEach(p => console.log(` - ${p.product_url}`));

    // Check if sitemaps were discovered
    const sitemaps = scraper.data.visitedUrls.filter(u => u.endsWith('.xml'));
    console.log(`Sitemaps Visited: ${sitemaps.length}`);
    sitemaps.forEach(s => console.log(` - ${s}`));
}

testDiscovery().catch(console.error);
