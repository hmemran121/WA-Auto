/**
 * Unified Structural DOM Analyzer
 * Uses node density and pattern matching to identify e-commerce elements.
 * 100% Algorithmic - No AI dependencies.
 */

class StructuralAnalyzer {
    
    /**
     * Identify potential product item containers based on repeating structures.
     */
    findProductClusters($) {
        const clusters = [];
        const body = $('body');
        
        // Strategy: Look for repeating sibling structures with high image/price density
        const candidates = $('div, section, article, li').filter((i, el) => {
            const children = $(el).find('*').length;
            return children > 3 && children < 50; // Standard product card size range
        });

        const seenPaths = new Map();

        candidates.each((i, el) => {
            const path = this.getCleanPath($, el);
            if (!path) return;

            if (!seenPaths.has(path)) {
                seenPaths.set(path, []);
            }
            seenPaths.get(path).push(el);
        });

        // Filter paths that have multiple siblings (repeating patterns)
        seenPaths.forEach((elements, path) => {
            if (elements.length >= 2) {
                const score = this.scoreCluster($, elements);
                if (score > 50) {
                    clusters.push({ path, count: elements.length, score, elements });
                }
            }
        });

        return clusters.sort((a, b) => b.score - a.score);
    }

    getCleanPath($, el) {
        const classes = ($(el).attr('class') || '').split(/\s+/).filter(c => c && !/\d/.test(c)).join('.');
        const tag = el.tagName;
        if (!classes) return tag;
        return `${tag}.${classes}`;
    }

    scoreCluster($, elements) {
        let score = 0;
        const first = $(elements[0]);
        
        // 1. Presence of images
        if (first.find('img').length > 0) score += 30;
        
        // 2. Presence of currency symbols (Algorithmically detected)
        const text = first.text();
        if (/[৳$]|Tk|BDT/i.test(text)) score += 40;
        
        // 3. Presence of numbers followed by currency or vice versa
        if (/\d+.*?(?:৳|Tk|BDT)|(?:৳|Tk|BDT).*?\d+/i.test(text)) score += 20;

        // 4. Links to product pages
        if (first.find('a[href*="/product"], a[href*="/p/"]').length > 0) score += 20;

        return score;
    }

    /**
     * Highly robust price extractor using proximity logic
     */
    extractPriceProximity($, container) {
        const text = container.text().replace(/\s+/g, ' ');
        // Regex for BDT, USD, etc.
        const priceRegex = /(?:৳|Tk|BDT|Rs|\$)\s*([\d,.]+)|([\d,.]+)\s*(?:৳|Tk|BDT|Rs|\$)/gi;
        
        let match;
        const prices = [];
        while ((match = priceRegex.exec(text)) !== null) {
            const val = match[1] || match[2];
            if (val) {
                const num = parseFloat(val.replace(/,/g, ''));
                if (!isNaN(num)) prices.push(num);
            }
        }

        if (prices.length > 0) {
            // Usually the first price found in a product card is the sale price
            // The largest is often the regular price if there's a discount
            return {
                sale_price: Math.min(...prices),
                regular_price: Math.max(...prices)
            };
        }

        return null;
    }
}

module.exports = new StructuralAnalyzer();
