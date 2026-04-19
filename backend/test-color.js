const colors = new Set([
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'gray', 'grey', 
  'navy', 'olive', 'teal', 'maroon', 'coral', 'lavender', 'heather', 'charcoal', 'ash', 'slate', 'pearl', 
  'emerald', 'ruby', 'sapphire', 'gold', 'silver', 'bronze', 'copper', 'platinum', 'ivory', 'cream', 'beige', 
  'tan', 'khaki', 'mustard', 'indigo', 'violet', 'magenta', 'cyan', 'turquoise', 'aqua', 'mint', 'lime', 
  'peach', 'apricot', 'plum', 'burgundy', 'rust', 'amber', 'ochre', 'midnight', 'dark', 'light', 'pale', 
  'deep', 'pastel', 'mix', 'melange', 'slate', 'dusty', 'smokey', 'pure', 'mineral', 'forest', 'mid', 'shadow',
  'lilac', 'lilas', 'quarry', 'myrtle', 'rose', 'sky', 'sea', 'sand', 'stone', 'slate', 'steel', 'crimson',
  'sage', 'slate', 'taupe', 'teal', 'terracotta', 'topaz', 'turquoise', 'vanilla', 'vermilion', 'wine', 'zinc',
  'stormy', 'weather', 'inky', 'phantom', 'peacot', 'evening', 'magical', 'fizzy', 'porcelain', 'roebuck',
  'yellowish', 'greenish', 'bluish', 'reddish', 'brownish', 'greyish', 'grayish', 'pinkish', 'purplish',
  'camo', 'camouflage', 'neon', 'fluorescent', 'metallic', 'matte', 'glossy', 'shiny', 'sparkle', 'glitter'
]);

function getBaseName(name) {
    if (!name) return name;
    let words = name.split(/\s+/);
    
    // Check if there are dashes for color suffixes, e.g., "Polo Shirt - Red" or "Polo Shirt-Red"
    if (words[words.length - 1].includes('-')) {
        let parts = words[words.length - 1].split('-');
        if (colors.has(parts[parts.length - 1].toLowerCase())) {
            parts.pop();
            words[words.length - 1] = parts.join('-');
            if (!words[words.length - 1]) words.pop();
        }
    }

    while (words.length > 2) {
        let lastWord = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '');
        if (colors.has(lastWord)) {
            words.pop();
        } else {
            break;
        }
    }
    
    return words.join(' ').trim();
}

const names = [
    'Go Easy T-shirt Olive Green Heather',
    'Go Easy T-shirt Mid Gray Heather',
    'Flex 360 Leggings Coral Blue',
    'Flex 360 Leggings Lavender',
    'Flex 360 Leggings Pink',
    'Flex 360 Leggings Navy',
    'Flex 360 Leggings Dark Gray',
    'Optimum Play Sports Bra Black Mix',
    'Dawn of Era Woven Jacket Black',
    'Origin Crewneck Curve Hem Tee',
    'Vitality Cropped Leggings',
    'Swiftstride Series-4 Joggers',
    'Atlas Women’s Track Pants',
    'Aeris Long-Sleeve Performance T-shirt',
    'Eclipse Drop Shoulder T-Shirt'
];

names.forEach(n => console.log(n, '=>', getBaseName(n)));
