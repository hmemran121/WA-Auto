const SmartScraper = require('./scraper-service.js');
const scraper = new SmartScraper();

const testUrls = [
    'https://hffoodservice.com/product/morich-gura/',
    'https://frshopsbd.com/product/churisutki'
];

async function deepDiagnose() {
    console.log("🔍 Deep Variant Debugger (V7.3)\n");

    const originalExtract = scraper.extractVariants.bind(scraper);
    scraper.extractVariants = ($, container) => {
        console.log(`\n--- [DEBUG] Container HTML (First 500 chars) ---`);
        console.log(container ? container.html()?.slice(0, 500) : "NO CONTAINER");
        return originalExtract($, container);
    };

    scraper.addProduct = (productData) => {
        console.log(`\n======================================================`);
        console.log(`📦 PRODUCT: ${productData.name}`);
        console.log(`🔗 URL: ${productData.product_url}`);
        console.log(`💰 Main Price: '${productData.price}' | Reg: '${productData.regular_price}' | Sale: '${productData.sale_price}'`);

        console.log(`\n--- 🔀 Variant Details ---`);
        try {
            const v = JSON.parse(productData.variants || '{"items":[], "price_map":{}}');
            console.log(`Items [${v.items.length}]:`);
            v.items.forEach((item, i) => {
                console.log(`  [${i}] Type: ${item.type} | Value: ${item.value} | Price: ${item.price} | SKU: ${item.sku}`);
            });
            console.log(`Price Map:`, v.price_map);
        } catch (e) {
            console.log("Error parsing variants:", e.message);
        }
    };

    for (const url of testUrls) {
        console.log(`\n⏳ Processing: ${url}`);
        await scraper.processPage(url, 'product', true);
    }

    process.exit(0);
}

deepDiagnose();
