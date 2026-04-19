const axios = require('axios');
const fs = require('fs');

async function dump() {
    const url = "https://turaag.com/products/elevate-running-polo-shirt-2";
    console.log(`📡 Fetching: ${url}`);
    
    try {
        const resp = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        fs.writeFileSync('turaag_product.html', resp.data);
        console.log("✅ Dumped to turaag_product.html");
    } catch (e) {
        console.error(e.message);
    }
}

dump();
