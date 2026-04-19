const axios = require('axios');
const cheerio = require('cheerio');

async function debugSailorExtraction() {
    const url = "https://sailor.clothing/details/womens-fashion-jump-suit-16766";
    try {
        const { data: html } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(html);
        const nextDataScript = $('script#__NEXT_DATA__').html();
        if (nextDataScript) {
            const data = JSON.parse(nextDataScript);
            const details = data.props?.pageProps?.details || {};
            console.log("NEXT_DATA Details Keys:", Object.keys(details));
            console.log("Name:", details.name);
            console.log("SKU:", details.sku);
            console.log("Description:", details.description);
            console.log("Fabrication (Material):", details.fabrication);
            console.log("Care Level (Wash Instruction):", details.care_level);
            console.log("Composition:", details.composition);
            console.log("Fit:", details.fit);
            console.log("Segment:", details.segment);
            console.log("Embellishment:", details.embellishment);
        } else {
            console.log("No __NEXT_DATA__ found");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

debugSailorExtraction();
