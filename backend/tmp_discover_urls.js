const axios = require('axios');
const cheerio = require('cheerio');

async function findUrls(baseUrl) {
    try {
        console.log(`\n--- Finding URLs for ${baseUrl} ---`);
        const res = await axios.get(baseUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 10000
        });
        const $ = cheerio.load(res.data);
        const links = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (!href) return;
            let fullUrl = href;
            if (href.startsWith('/')) fullUrl = new URL(href, baseUrl).href;
            if (!fullUrl.startsWith(baseUrl)) return;

            // Heuristic for product URLs
            const isProduct = fullUrl.includes('/product/') ||
                fullUrl.includes('/products/') ||
                fullUrl.includes('/item/') ||
                fullUrl.match(/\/[p|details]\//) ||
                (fullUrl.split('/').length > 4 && !fullUrl.includes('/category/') && !fullUrl.includes('/collection/'));

            if (isProduct && !links.includes(fullUrl)) {
                links.push(fullUrl);
            }
        });
        console.log(links.slice(0, 5).join('\n'));
    } catch (e) {
        console.log(`Failed to fetch ${baseUrl}: ${e.message}`);
    }
}

const sites = [
    'https://sailor.clothing',
    'https://turaag.com',
    'https://frshopsbd.com',
    'https://riverfish.com.bd',
    'https://hffoodservice.com'
];

(async () => {
    for (const site of sites) {
        await findUrls(site);
    }
})();
