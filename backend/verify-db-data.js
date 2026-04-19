const dbUtils = require('./db');

async function verify() {
    console.log("--- DB INTEGRITY VERIFICATION ---");

    const urls = [
        'https://turaag.com/products/aerofit-compression-t-shirt',
        'https://sailor.clothing/details/rb-ef62-bmscs-20371-44471'
    ];

    for (const url of urls) {
        console.log(`\n🔍 Checking URL: ${url}`);
        const results = await dbUtils.getAIProducts({ url });
        const p = results[0];

        if (p) {
            console.log(`Name: ${p.name}`);
            console.log(`Price: ${p.price}`);
            console.log(`Description (first 100): ${p.description ? p.description.substring(0, 100) : "MISSING"}`);
            console.log(`Composition: ${p.composition || "MISSING"}`);
            console.log(`Handling: ${p.handling_guidelines || "MISSING"}`);
            console.log(`Technical Attribs: ${p.technical_attributes ? p.technical_attributes.substring(0, 100) : "MISSING"}`);
        } else {
            console.log("❌ Product not found in database.");
        }
    }

    process.exit(0);
}

verify().catch(err => {
    console.error(err);
    process.exit(1);
});
