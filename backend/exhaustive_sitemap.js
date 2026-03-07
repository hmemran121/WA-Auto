const axios = require('axios');

async function exhaustiveSitemapCheck() {
    const commonPaths = [
        '/sitemap.xml',
        '/sitemap_index.xml',
        '/sitemapindex.xml',
        '/media/sitemap.xml',
        '/pub/media/sitemap.xml',
        '/static/sitemap.xml',
        '/sitemap/sitemap.xml',
        '/sitemaps/sitemap.xml'
    ];

    console.log("🔍 Exhaustive Sitemap Check for Pickaboo...");

    // 1. Full robots.txt read
    try {
        console.log("Reading full robots.txt...");
        const res = await axios.get('https://www.pickaboo.com/robots.txt', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        console.log("--- robots.txt Content ---");
        console.log(res.data);
        console.log("--------------------------");

        const sitemapMatch = res.data.match(/Sitemap:\s*(.+)/i);
        if (sitemapMatch) {
            console.log(`✅ Found sitemap in robots.txt: ${sitemapMatch[1]}`);
            commonPaths.push(new URL(sitemapMatch[1].trim()).pathname);
        }
    } catch (e) {
        console.log(`Failed to read robots.txt: ${e.message}`);
    }

    // 2. Brute force check common paths
    for (const path of [...new Set(commonPaths)]) {
        const url = `https://www.pickaboo.com${path}`;
        try {
            console.log(`Checking: ${url}`);
            const res = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 5000
            });
            if (res.status === 200) {
                console.log(`✨ FOUND SITEMAP: ${url}`);
                console.log(`   Type: ${res.headers['content-type']}`);
                return;
            }
        } catch (e) {
            // console.log(`- ${path}: ${e.response ? e.response.status : e.message}`);
        }
    }

    console.log("❌ No standard sitemaps found.");
}

exhaustiveSitemapCheck();
