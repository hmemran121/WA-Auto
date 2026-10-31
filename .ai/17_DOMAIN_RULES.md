# 17_DOMAIN_RULES.md — Business & Domain Specific Rules (Spintax, Delay, OMS, Scraper)

## 📌 DOMAIN RULES SPECIFICATION

This document outlines the strict domain logic rules governing messaging, scraping, and order balance calculations within **WA-Auto**.

---

## 1. SPINTAX & VARIABLE RESOLUTION RULES

- **Spintax Syntax:** Nested or flat brace-pipe format: `{Hi|Hello|Greetings}` or `{Special {offer|discount}|Great deal}`.
- **Variable Syntax:** Double curly braces `{{key}}` mapped strictly to contact variables or order details.
- **Sanity Guard:** Unresolved variables (e.g. missing `{{Name}}`) must fallback gracefully to default values (e.g. `"Customer"`) without leaking curly brace templates to recipients.

---

## 2. ANTI-BAN & RATE LIMITING DOMAIN BOUNDS

- **Message Interval:** Random delay bounded between 8,000ms and 15,000ms per message.
- **Batch Breaks:** After sending 20 to 35 messages continuously, trigger a mandatory break of 3 to 5 minutes.
- **Pause/Cancel Interruption:** When a user clicks Pause or Cancel on UI, execution must halt within a maximum of 500ms without sending the next scheduled message in queue.

---

## 3. ZERO-MISS SCRAPER GUARDS

- **Sitemap Priority:** Crawling MUST inspect `sitemap.xml` or `/collections/all` prior to parsing category sub-pages.
- **Dynamic Exit Rule:** If 4 consecutive category pages return 0 new products, terminate the category tree crawl immediately.
- **Strict Field Isolation:** Short descriptions and detailed descriptions must be isolated. Do NOT pollute a missing short description with raw HTML long descriptions.

---

## 4. OMS DYNAMIC BALANCE MERGE LOGIC

- **Order Tracking:** Group orders by `delivery_address` for logistics fulfillment.
- **Finance Channel:** Financial balance follows a single consolidated due channel.
- **Balance Transfer:** When a customer creates a new order at Address B after previous orders at Address A, the remaining balance from Address A transfers dynamically with reference tags to Address B's invoice.
- **Payment Deductions:** Payments recorded against Address A's master order must automatically update Address B's consolidated due calculation to prevent double-billing.
