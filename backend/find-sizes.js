const cheerio = require('cheerio');
const fs = require('fs');
const html = fs.readFileSync('sailor_html.html', 'utf8');
const $ = cheerio.load(html);

// Look for elements with exact text "38", "40"
let found = false;
$('*').each((i, el) => {
    if ($(el).children().length === 0) {
        const text = $(el).text().trim();
        if (text === '38' || text === '40') {
            const cls = $(el).attr('class');
            console.log(`Tag: ${el.tagName}, class: ${cls}, text: ${text}`);
            // Let's print the parent's class too
            const parentUrl = $(el).parent().attr('class');
            console.log(`Parent class: ${parentUrl}`);
            found = true;
        }
    }
});
if (!found) console.log("Direct text '38' or '40' not found as leaf nodes.");
