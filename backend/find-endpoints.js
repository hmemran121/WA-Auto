const fs = require('fs');

const html = fs.readFileSync('sailor_html.html', 'utf8');

// Find all URLs matching .json or api
const matches = html.match(/(https?:\/\/[^\s"'`]+(?:json|api)[^\s"'`]*|(?:\/_next\/data\/[^\s"'`]+))/gi);

if (matches) {
    const unique = [...new Set(matches)];
    console.log("Endpoints found:\n" + unique.slice(0, 15).join('\n'));
} else {
    console.log("No endpoint matches found.");
}
