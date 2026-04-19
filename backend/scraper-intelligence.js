/**
 * V17.5: Scraper Intelligence Baseline
 * Centralized registry for dynamic patterns and platform adapters.
 * Eliminates hardcoding site-specific logic in the main service.
 */

const BASELINE_LOGIC = {
    platforms: {
        SHOPIFY: {
            detect: ($) => $('script').text().includes('Shopify.content_for_header') || $('link[href*="cdn.shopify.com"]').length > 0,
            selectors: {
                variants: ['ShopifyAnalytics.meta', 'productVariants', 'ShopifyAnalytics.lib.track']
            }
        },
        WOOCOMMERCE: {
            detect: ($) => $('body').hasClass('woocommerce-page') || $('.woocommerce-Price-amount').length > 0,
            selectors: {
                variants: ['.variations_form']
            }
        },
        NEXTJS: {
            detect: ($) => $('script#__NEXT_DATA__').length > 0,
            selectors: {
                data: ['#__NEXT_DATA__']
            }
        }
    },
    
    noise: {
        product: [
            /^Home\s*\/.*?\s*Popular\s*/i,
            /^Home\s*\/.*?\s*Category:.*?\s*/i,
            /Price:\s*৳?\s*[\d,.]+/gi,
            /SKU:\s*[A-Z\d-]+/gi,
            /Category:\s*.*?\s*$/i,
            /Add to Wishlist/gi,
            /Add to cart/gi,
            /Bag\s*Bag/gi,
            /Online Shop Bangladesh/gi,
            /\s+-\s+Turaag\s*Active/gi
        ],
        description: [
            'script', 'style', 'noscript', 'iframe', 'form', 'button', 
            '.zoomContainer', '.variations', '.social-sharing'
        ]
    },

    policy: {
        required: ['name', 'price'],
        minNameLength: 4,
        minPrice: 0,
        integrityCheck: (prod) => {
            if (!prod.name || prod.name.length < 4) return { valid: false, reason: "Name too short or empty" };
            const priceNum = parseFloat(String(prod.price).replace(/[^0-9.]/g, ''));
            if (isNaN(priceNum) && (!prod.variants || prod.variants.length === 0)) return { valid: false, reason: "No price found" };
            return { valid: true };
        }
    },

    variants: {
        // Anti-Patterns to reject as Size/Color
        antiPatterns: [
            /^[A-Z\d-]{5,}$/,        // Classic SKU (TRGM032202A, ABC-123)
            /^\d+$/,                 // Pure Numbers without context
            /Default Title/i,        // Shopify boilerplate
            /Variant/i,              // Generic placeholder
            /Option/i,               // Generic placeholder
            /Title/i                 // Generic placeholder
        ],
        // Known Size Keywords (Whitelist)
        sizes: [
            's', 'm', 'l', 'xl', 'xxl', '2xl', '3xl', '4xl', '5xl', 'xs', 
            'small', 'medium', 'large', 'extra large', 'slim fit', 'regular fit',
            '28', '30', '32', '34', '36', '38', '40', '42', '44', '46',
            'সাইজ', 'স্মল', 'লার্জ', 'মিডিয়াম'
        ],
        // Known Color Keywords (Whitelist)
        colors: [
            'red', 'blue', 'green', 'black', 'white', 'yellow', 'brown', 'pink', 'purple', 
            'grey', 'gray', 'orange', 'silver', 'gold', 'beige', 'navy', 'maroon', 'teal', 
            'cyan', 'magenta', 'lime', 'olive', 'indigo', 'violet', 'charcoal', 'ivory', 
            'khaki', 'tan', 'teal', 'লাল', 'নীল', 'সবুজ', 'কালো', 'সাদা', 'হলুদ', 'বাদামী'
        ]
    }
};

module.exports = BASELINE_LOGIC;
