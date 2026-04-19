const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');

async function testSailor() {
    const url = "https://www.sailor.clothing/men-s-panjabi-61405.html";
    const res = await axios.get(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
    });
    const $ = cheerio.load(res.data);
    const nextDataScript = $('script#__NEXT_DATA__').html();
    
    if (nextDataScript) {
        fs.writeFileSync('sailor_nextdata.json', nextDataScript);
        console.log("Saved to sailor_nextdata.json");
    } else {
        console.log("No next data script found in HTML");
    }
}

testSailor();
