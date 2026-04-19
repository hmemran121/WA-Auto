try {
  const CrawlerService = require('./crawler-service');
  const c = new CrawlerService();
  c.runBackgroundCrawl('test-crawl').then(() => console.log('Done')).catch(console.error);
} catch(e) {
  console.error(e);
}
