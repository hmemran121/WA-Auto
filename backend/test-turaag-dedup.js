const CrawlerService = require('./crawler-service');
const SmartScraper = require('./scraper-service');

(async () => {
    console.log('Starting Scraper Test');
    const scraper = new SmartScraper('test-1');
    await scraper.scan('https://turaag.com/collections/womens-t-shirts-tops', {
        isApiSync: true,
        maxPages: 1
    });
    console.log('Done scanning!');
    process.exit(0);
})();
