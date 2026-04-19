const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');

async function testSailor() {
    const url = "https://www.sailor.clothing/men-s-panjabi-61405.html";
    const res = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    fs.writeFileSync('sailor_html.html', res.data);
    console.log("HTML saved");
}

testSailor();
