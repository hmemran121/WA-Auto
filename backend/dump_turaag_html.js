const axios = require('axios');
const cheerio = require('cheerio');

async function dump() {
    const url = "https://turaag.com/products/dawn-of-era-polo-shirt-6";
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(response.data);
        
        console.log("--- Form Selectors ---");
        $('form').each((i, el) => {
            console.log(`Form ${i}: class="${$(el).attr('class')}" id="${$(el).attr('id')}" action="${$(el).attr('action')}"`);
        });

        console.log("\n--- Select Tags ---");
        $('select').each((i, el) => {
            console.log(`Select ${i}: name="${$(el).attr('name')}" id="${$(el).attr('id')}" class="${$(el).attr('class')}"`);
            $(el).find('option').each((j, opt) => {
                console.log(`  Option ${j}: value="${$(opt).attr('value')}" text="${$(opt).text().trim()}"`);
            });
        });

        console.log("\n--- Potential Swatch Tags (fieldset/input/label) ---");
        $('fieldset, label, input[type="radio"]').each((i, el) => {
             const $el = $(el);
             const text = $el.text().trim() || $el.val() || "";
             if (text.length > 0 && text.length < 50) {
                 console.log(`${el.name} ${i}: class="${$el.attr('class')}" text/val="${text}"`);
             }
        });

    } catch (e) {
        console.log("Error:", e.message);
    }
}

dump();
