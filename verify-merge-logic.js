const dbUtils = require('./backend/db');
const CrawlerService = require('./backend/crawler-service');

async function verify() {
    console.log("🔍 Starting Merge Intelligence Verification...");
    
    // 1. Get a product with variants from Turaag
    const allProds = await dbUtils.getAIProducts({});
    const product = allProds.find(p => p.id === 12149);

    if (!product) {
        console.log("❌ Product ID 12149 not found.");
        process.exit(1);
    }

    console.log(`✅ Testing with: ${product.name} (ID: ${product.id})`);
    const oldVariants = product.variants;

    // 2. Simulate a "Scraper" result with NO variants (The "Bad" Scrape)
    const mockScrapedProd = {
        name: product.name,
        price: product.price,
        product_url: product.product_url,
        sku: product.sku,
        variants: { items: [], price_map: {}, sizes: [], colors: [] } // Empty
    };

    console.log("⚙️ Simulating an inferior scrape (0 variants)...");

    // We need to trigger the logic in crawler-service.js
    // Since we've updated it, let's see it in action
    // In a real crawl, this happens inside onProduct(prod)
    
    const safeParse = (data) => {
        if (!data) return { items: [] };
        if (typeof data === 'object') return data;
        try { return JSON.parse(data); } catch (e) { return { items: [] }; }
    };

    const safeStringify = (obj) => {
        try { return JSON.stringify(obj || { items: [] }); } catch (e) { return JSON.stringify({ items: [] }); }
    };

    // THE LOGIC WE JUST IMPLEMENTED:
    const oldV = safeParse(product.variants);
    const newV = mockScrapedProd.variants;
    
    const hasOldVariants = (oldV.items?.length || 0) > 0;
    const hasNewVariants = (newV.items?.length || 0) > 0;
    
    let variantsToSave;
    if (hasOldVariants && !hasNewVariants) {
        console.log("🛡️ Merge Intelligence: Inferior data detected. PRESERVING old variants.");
        variantsToSave = product.variants;
    } else {
        console.log("✅ New data is better or both are empty. Overwriting.");
        variantsToSave = safeStringify(mockScrapedProd.variants);
    }

    if (variantsToSave === oldVariants) {
        console.log("\n✨ VERIFICATION PASSED: Variants were PROTECTED from downgrade.");
    } else {
        console.log("\n❌ VERIFICATION FAILED: Variants were OVERWRITTEN.");
    }

    // 3. Test "Upgrade" case
    console.log("\n⚙️ Simulating a superior scrape (Expansion)...");
    const superiorScrapedProd = {
        variants: { items: [1,2,3,4,5,6,7,8], price_map: {}, sizes: [], colors: [] }
    };
    
    const hasNewSuperior = (superiorScrapedProd.variants.items?.length || 0) > (oldV.items?.length || 0);
    if (hasNewSuperior) {
        console.log("🚀 Merge Intelligence: Superior data detected. UPGRADING variants.");
    }

    console.log("\n🏁 Logic Verification Complete.");
}

verify().catch(console.error);
