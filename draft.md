# Advanced Template Integration Plan (Phase 2)

## Overview (সারসংক্ষেপ)
যেহেতু আপনি আরও বেশি ইউনিক এবং শক্তিশালী (Out-of-the-Box) ফিচার চাচ্ছেন, তাই আমরা **Spintax**, **Location Attachment**, **VCard (Contact Card)** এবং **Interactive Buttons/List** নিয়ে কাজ করব। এগুলোকে একসাথে ইমপ্লিমেন্ট করা বেশ জটিল, তাই আমরা পর্যায়ক্রমে (Phase by Phase) আগাবো।

---

## Phase 1: Conditional Logic Formatting (Spintax)
সবচেয়ে সহজে ইমপ্লিমেন্ট করা সম্ভব এবং এন্টি-ব্যান (Anti-Ban) এর জন্য সবচেয়ে দরকারী।
*   **Backend (`messages.js`):** মেসেজ ডাটাবেসে বা WhatsApp এ সেন্ড করার ঠিক আগে একটি রেগুলার এক্সপ্রেশন (RegEx) ফাংশন অ্যাড করা হবে।
    *   **লজিক:** `/{([^}]+)}/g` প্যাটর্ন ধরে `{Hi|Hello|Hey}` এর মত ব্লকগুলোকে খুঁজে বের করবে।
    *   তারপর `|` দিয়ে স্লিট (split) করে র‍্যান্ডমলি (Randomly) যেকোনো একটি শব্দ পিক করে মূল মেসেজে বসিয়ে দেবে।
*   **Frontend (`TemplatesView.tsx` / `Template Modal`):**
    *   AI Generator বা ভ্যারিয়েবলের মতো একটি **"Spintax Generator"** বাটন দেওয়া যেতে পারে।
    *   ইউজার কয়েকটি শব্দ দিলে সিস্টেম নিজে থেকেই `{word1|word2|word3}` ফরম্যাট তৈরি করে টেক্সট এডিটরে ইনজেক্ট করে দেবে।

## Phase 2: Location Attachment Template (Google Maps Pinhole)
`whatsapp-web.js` এ `Location` অবজেক্ট সাপোর্ট করে, তাই এটি পাঠানো সম্ভব।
*   **Frontend (`TemplatesView.tsx` / `Template Modal`):**
    *   Attachment অপশনে ইমেজের পাশাপাশি **"Location"** অপশন যোগ করা হবে।
    *   ইউজার ক্লিক করলে **Latitude (ল্যাটিচিউড)**, **Longitude (লঙ্গিচিউড)** এবং **লুকেশনের নাম/ক্যাপশন** ইনপুট দেওয়ার ছোট একটি ফর্ম আসবে।
    *   টেমপ্লেটের JSON স্ট্রাকচারে এটি আলাদা একটি attachment type (`location`) হিসেবে সেভ হবে।
*   **Backend (`whatsapp-service.js`):**
    *   `mediaType === 'location'` হলে, `const { Location } = require('whatsapp-web.js');` ইমপোর্ট করে নতুন `Location(lat, lng, name)` অবজেক্ট তৈরি করা হবে।
    *   এরপর `client.sendMessage(chatId, newLocationObj)` মেথডে পাঠানো হবে।

## Phase 3: VCard (Contact Card) Injection
WhatsApp এ কাউকে ভি-কার্ড পাঠালে সেটি একটি "Message Contact" বাটন হিসেবে যায়।
*   **Frontend (`TemplatesView.tsx` / `Template Modal`):**
    *   Attachment অপশনে **"Contact (VCard)"** অপশন যোগ হবে।
    *   ইউজার একটি ছোট ফর্মে **Name** এবং **Phone Number** দিয়ে VCard সেভ করবে।
*   **Backend (`whatsapp-service.js` / DB):**
    *   `mediaType === 'vcard'` হলে একটি স্ট্যান্ডার্ড `.vcf` স্ট্রিং তৈরি করা হবে।
    *   `options.sendVCard = true` বা কাস্টম VCard ফরম্যাটিংয়ের মাধ্যমে `client.sendMessage` 에 পাঠানো হবে।

## Phase 4: Interactive Buttons / List Messages (Researched Implementation)
এটি সবচেয়ে এক্সাইটিং কিন্তু কিছুটা ট্রিকি কারণ সাধারণ WhatsApp Accounts এ বাটন সাপোর্ট সবসময় কাজ করে না (Official API ছাড়া)। তবে `whatsapp-web.js` এর `Buttons` বা `List` মডিউল দিয়ে এটি করা সম্ভব।
*   **Frontend (`TemplatesView.tsx` / `Template Modal`):**
    *   টেমপ্লেট এডিটরের নিচে **"Add Buttons"** অপশন থাকবে।
    *   সর্বোচ্চ ৩টি বাটন (যেমন- 'Interested', 'Not Interested', 'Call Me') যোগ করা যাবে।
*   **Backend (`whatsapp-service.js`):**
    *   `const { Buttons } = require('whatsapp-web.js');` ইমপোর্ট করে `new Buttons('body', [{body: 'btn1'}, ...], 'title', 'footer')` লেআউট তৈরি করা হবে।
    *   যদি নরমাল একাউন্টে বাটন না যায়, তবে ফলব্যাক (Fallback) হিসেবে List message পাঠানো যেতে পারে।

---

## User Direction Required
আমরা কি **Phase 1 (Spintax / conditional formatting)** এবং **Phase 2 (Location Attachment)** দিয়ে আগে শুরু করব? এই দুটি সবচেয়ে বেশি স্টেবল এবং যেকোনো WhatsApp নাম্বারে সাপোর্ট করবে।