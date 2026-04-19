const fs = require('fs');
const html = fs.readFileSync('sailor_html.html', 'utf8');

const regex = /(https?:\/\/[^\s"'`]+61405[^\s"'`]*)/gi;
const matches = html.match(regex);
if (matches) {
    console.log("Found API urls:", [...new Set(matches)].join('\n'));
} else {
    console.log("No exact 61405 URL match inside strings, checking JSON structures.");
}
