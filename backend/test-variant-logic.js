const SmartScraper = require('./scraper-service');
const BASELINE = require('./scraper-intelligence');

const scraper = new SmartScraper();

const testCases = [
    {
        name: "Turaag SKU Case (Should be rejected as Size)",
        sku: "TRGM032202A",
        variants: [
            { type: "Option", value: "TRGM032202A", sku: "TRGM032202A" }
        ]
    },
    {
        name: "Sailor Valid Size Case (Should be accepted)",
        sku: "SAIL-123",
        variants: [
            { type: "Size", value: "XL", sku: "SAIL-123-XL" }
        ]
    },
    {
        name: "Shopify Default Title Case (Should be rejected)",
        sku: "DEF-001",
        variants: [
            { type: "Title", value: "Default Title", sku: "DEF-001" }
        ]
    },
    {
        name: "Numerical Size (Should be accepted)",
        sku: "PANT-001",
        variants: [
            { type: "Option", value: "32", sku: "PANT-001-32" }
        ]
    }
];

console.log("🚀 Starting Variant Logic Verification...\n");

testCases.forEach(tc => {
    console.log(`Testing: ${tc.name}`);
    
    // We simulate the part of normalizeProduct that processes variants
    const sizes = [];
    const colors = [];
    const processed = [];

    tc.variants.forEach(v => {
        const val = v.value;
        const lowerType = v.type.toLowerCase();
        
        // V18.0 Logic implementation check
        const isAntiPattern = BASELINE.variants.antiPatterns.some(p => p.test(val));
        const isExactSku = val === tc.sku;
        
        let rejected = false;
        if (isAntiPattern || isExactSku) {
            const isWhiteListedSize = BASELINE.variants.sizes.includes(val.toLowerCase());
            if (!isWhiteListedSize) {
                rejected = true;
            }
        }

        if (!rejected) {
            processed.push(v);
            const checkVal = val.toLowerCase();
            if (BASELINE.variants.colors.includes(checkVal) || lowerType.includes('color')) {
                colors.push(val);
            } else if (BASELINE.variants.sizes.includes(checkVal) || lowerType.includes('size')) {
                sizes.push(val);
            } else {
                // Fallback
                if (val.length < 10 && !/^[A-Z\d-]{5,}$/.test(val)) {
                    sizes.push(val);
                }
            }
        }
    });

    console.log(`   Result: ${processed.length > 0 ? "PASSED (Accepted)" : "REJECTED"}`);
    console.log(`   Sizes: ${JSON.stringify(sizes)}`);
    console.log(`   Colors: ${JSON.stringify(colors)}`);
    console.log("-----------------------------------\n");
});
