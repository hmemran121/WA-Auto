const axios = require('axios');
const cheerio = require('cheerio');

async function extractNextData() {
    const url = 'https://www.pickaboo.com/';
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    try {
        const res = await axios.get(url, { headers: { 'User-Agent': ua } });
        const $ = cheerio.load(res.data);
        const nextData = $('#__NEXT_DATA__').html();

        if (nextData) {
            console.log("✅ Found __NEXT_DATA__ script.");
            const data = JSON.parse(nextData);

            // Search for categories or products in the massive object
            console.log("\n--- Structural Overview ---");
            console.log(Object.keys(data).join(', '));

            if (data.props && data.props.pageProps) {
                const pp = data.props.pageProps;
                console.log("\n--- PageProps Keys ---");
                console.log(Object.keys(pp).join(', '));

                // Let's look for navigation/menu
                if (pp.navData || pp.menu || pp.categories) {
                    console.log("✅ Found potential Navigation Data!");
                }
            }

            // Search string for category/product URLs
            const jsonStr = JSON.stringify(data);
            const urls = jsonStr.match(/\"url\":\s*\"([^\"]+)\"/g) || [];
            console.log(`\nFound ${urls.length} internal URLs in JSON.`);
            urls.slice(0, 10).forEach(u => console.log(`- ${u}`));

        } else {
            console.log("❌ __NEXT_DATA__ not found.");
            // Check other scripts
            $('script').each((_, el) => {
                const content = $(el).html();
                if (content && content.includes('categories')) {
                    console.log("Found a script containing 'categories'!");
                }
            });
        }

    } catch (e) {
        console.log(`❌ Error: ${e.message}`);
    }
}

extractNextData();
