const fs = require('fs');
const data = JSON.parse(fs.readFileSync('sailor_nextdata.json', 'utf8'));
const props = data.props?.pageProps;

Object.keys(props).forEach(key => {
    console.log(`Key: ${key}`);
    if (typeof props[key] === 'object' && props[key] !== null) {
        console.log(`  Subkeys: ${Object.keys(props[key]).join(', ')}`);
    }
});

if (props.product) {
    console.log("Product keys:", Object.keys(props.product).join(", "));
}

// look for variations in any key
const searchKeys = ['variants', 'variations', 'choice_options', 'sizes', 'colors', 'stock', 'inventory'];
function searchDeep(obj, path = "") {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(k => {
        if (searchKeys.includes(k) && Object.keys(obj[k]).length > 0) {
            console.log(`Found ${k} at ${path}.${k}`);
        }
        if (typeof obj[k] === 'object') {
            searchDeep(obj[k], `${path}.${k}`);
        }
    });
}
searchDeep(props, "props");
