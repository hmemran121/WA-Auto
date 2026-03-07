require('dotenv').config();
const https = require('https');

function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;

    https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                console.log(JSON.stringify(json, null, 2));
            } catch (e) {
                console.error("JSON Parse Error:", e.message);
                console.log("Raw Data:", data);
            }
        });
    }).on('error', (err) => {
        console.error("Request Error:", err.message);
    });
}

listModels();
