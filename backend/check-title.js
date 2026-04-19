const cheerio = require('cheerio');
const fs = require('fs');
const html = fs.readFileSync('sailor_html.html', 'utf8');
const $ = cheerio.load(html);
console.log($('title').text());
