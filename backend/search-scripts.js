const cheerio = require('cheerio');
const fs = require('fs');
const html = fs.readFileSync('sailor_html.html', 'utf8');
const $ = cheerio.load(html);

$('script').each((i, el) => {
    let scriptContent = $(el).html() || '';
    if (scriptContent.length > 50) {
        if (scriptContent.includes('variant') || scriptContent.includes('price') || scriptContent.includes('product') || scriptContent.includes('__NEXT_DATA__') === false) {
             // check if it has JSON-like structure
             if (scriptContent.includes('{') && scriptContent.includes('}')) {
                 fs.writeFileSync(`script_${i}.txt`, scriptContent);
                 console.log(`Saved script ${i}.txt, length: ${scriptContent.length}`);
             }
        }
    }
});
