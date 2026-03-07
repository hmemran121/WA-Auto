const axios = require('axios');
const cheerio = require('cheerio');

async function countPickabooProducts() {
    const sitemapIndexUrl = 'https://www.pickaboo.com/sitemapindex.xml';
    console.log(`🚀 Fetching Sitemap Index: ${sitemapIndexUrl}`);

    try {
        const res = await axios.get(sitemapIndexUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 20000
        });

        const $ = cheerio.load(res.data, { xmlMode: true });
        const sitemaps = [];
        $('sitemap loc').each((_, el) => {
            const url = $(el).text();
            if (url.includes('product') || url.includes('/sitemap/')) {
                sitemaps.push(url);
            }
        });

        console.log(`Found ${sitemaps.length} sitemaps to process.`);

        let totalCount = 0;
        for (const sitemapUrl of sitemaps) {
            console.log(`- Processing: ${sitemapUrl}`);
            const sres = await axios.get(sitemapUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 20000
            });
            const $s = cheerio.load(sres.data, { xmlMode: true });
            const count = $s('url loc').length;
            console.log(`  -> Count: ${count}`);
            totalCount += count;
        }

        console.log(`\n✅ Final Product Count Estimation (from Sitemaps): ${totalCount}`);

    } catch (e) {
        console.log(`❌ Error: ${e.message}`);
    }
}

countPickabooProducts();
