const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { formatNumber } = require('./utils/phoneFormatter');

const dbFile = process.env.NODE_ENV === 'test' ? 'test_data.db' : 'data.db';
const db = new sqlite3.Database(path.join(__dirname, dbFile));

// Optimization: PRAGMAs for performance and integrity
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA busy_timeout = 10000'); // Wait up to 10s for locks
db.run('PRAGMA foreign_keys = ON');

// [MUTEX ENGINE] - Prevents transaction overlaps in async context
const dbQueue = [];
let dbProcessing = false;

const processQueue = async () => {
    if (dbProcessing || dbQueue.length === 0) return;
    dbProcessing = true;
    const { task, resolve, reject } = dbQueue.shift();
    try {
        const result = await task();
        resolve(result);
    } catch (err) {
        reject(err);
    } finally {
        dbProcessing = false;
        processQueue();
    }
};

const enqueue = (task) => new Promise((resolve, reject) => {
    dbQueue.push({ task, resolve, reject });
    processQueue();
});

// [ENTERPRISE STOCK ENGINE] - Standalone helper for robust inventory sync
const _adjustStockInternal = async (items, type = 'deduct') => {
    const factor = type === 'deduct' ? -1 : 1;
    for (const item of items) {
        if (!item.id) continue;
        await new Promise((res) => {
            db.get("SELECT name, stock_quantity, variants FROM intelligent_product_catalog WHERE id = ?", [item.id], (err, product) => {
                if (err || !product) { console.error(`[STOCK ENGINE] Product Not Found: ${item.id}`, err); return res(); }
                
                let newGlobal = (parseFloat(product.stock_quantity) || 0) + ((item.qty || 1) * factor);
                let newVariants = product.variants;
                if ((item.variant || item.variantName) && product.variants) {
                    try {
                        const vName = (item.variantName || item.variant).toString().trim();
                        let vObj = JSON.parse(product.variants);
                        let vItems = Array.isArray(vObj) ? vObj : (vObj.items || []);
                        let matchFound = false;
                        vItems = vItems.map((v, i) => {
                            const dbVName = (v.name || (v.type && v.value ? `${v.type}: ${v.value}` : (v.value || v.type || v.sku || `Variant ${i + 1}`))).toString().trim();
                            if (dbVName === vName) { 
                                v.stock = (parseFloat(v.stock) || 0) + ((item.qty || 1) * factor); 
                                matchFound = true; 
                            }
                            return v;
                        });
                        if (matchFound) {
                            if (Array.isArray(vObj)) vObj = vItems; else vObj.items = vItems;
                            newVariants = JSON.stringify(vObj);
                            newGlobal = vItems.reduce((sum, v) => sum + (parseFloat(v.stock) || 0), 0);
                        }
                    } catch (e) { console.error("[STOCK ENGINE] Variant error", e); }
                }
                db.run("UPDATE intelligent_product_catalog SET stock_quantity = ?, variants = ? WHERE id = ?", [newGlobal, newVariants, item.id], () => {
                    dbUtils.invalidateTenantCache('default').catch(() => {});
                    res();
                });
            });
        });
    }
};

// Initialize tables
db.serialize(() => {
    db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      number TEXT UNIQUE,
      tags TEXT DEFAULT '[]',
      engagement_score INTEGER DEFAULT 0,
      email TEXT,
      address TEXT,
      city TEXT,
      company_name TEXT,
      last_purchase TEXT,
      lifecycle_stage TEXT DEFAULT 'lead',
      lifetime_value REAL DEFAULT 0,
      sentiment_score INTEGER DEFAULT 100,
      funnel_notes TEXT,
      ai_memory_summary TEXT,
      last_summary_at TIMESTAMP,
      interest_score INTEGER DEFAULT 0,
      price_sensitivity_score INTEGER DEFAULT 0,
      loyalty_score INTEGER DEFAULT 0
    );
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      whatsapp_id TEXT,
      number TEXT,
      text TEXT,
      timestamp TEXT,
      status TEXT,
      type TEXT DEFAULT 'sent',
      media_path TEXT,
      media_type TEXT,
      reaction TEXT,
      quoted_msg_body TEXT
    );
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    );
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS contact_groups (
      contact_id INTEGER,
      group_id INTEGER,
      PRIMARY KEY (contact_id, group_id),
      FOREIGN KEY (contact_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      media_path TEXT,
      media_type TEXT,
      usage_count INTEGER DEFAULT 0,
      is_pinned INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS template_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER,
      message_id INTEGER,
      whatsapp_id TEXT UNIQUE,
      status TEXT DEFAULT 'sent',
      responded INTEGER DEFAULT 0,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
    );
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS ai_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_number TEXT,
      user_query TEXT,
      ai_response TEXT,
      context_used TEXT,
      confidence_score REAL,
      is_handover INTEGER DEFAULT 0,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      api_config_id INTEGER,
      purpose TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      cost REAL,
      latency INTEGER
    );
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS ai_api_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      provider TEXT DEFAULT 'google',
      api_key TEXT NOT NULL,
      model TEXT DEFAULT 'gemini-2.5-flash-lite',
      status TEXT DEFAULT 'active',
      is_primary INTEGER DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS ai_response_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_hash TEXT UNIQUE,
      pure_query TEXT,
      product_id INTEGER,
      response_text TEXT,
      vector TEXT,
      metadata TEXT,
      intent_key TEXT,
      tenant_id TEXT DEFAULT 'default',
      catalog_version_hash TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP
    );
    db.run("ALTER TABLE ai_response_cache ADD COLUMN intent_key TEXT", () => {});
    db.run("ALTER TABLE ai_response_cache ADD COLUMN tenant_id TEXT DEFAULT 'default'", () => {});
    db.run("ALTER TABLE ai_response_cache ADD COLUMN catalog_version_hash TEXT", () => {});
  `);

    // ── Unified Campaigns Tracker ───────────────────────────────────────────────────
    db.run(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'instant' CHECK(type IN ('instant', 'scheduled', 'ai')),
      target_type TEXT NOT NULL CHECK(target_type IN ('contact', 'group')),
      target_id TEXT NOT NULL,
      target_name TEXT,
      scheduled_at TEXT, -- Nullable for instant campaigns
      status TEXT DEFAULT 'pending'
        CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'paused')),
      sent_count INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      total_recipients INTEGER DEFAULT 0,
      template_id INTEGER REFERENCES templates(id),
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      paused_at TEXT,
      is_adjusted INTEGER DEFAULT 0,
      original_scheduled_at TEXT,
      delayMin INTEGER,
      delayMax INTEGER,
      execution_windows TEXT DEFAULT '[]',
       rispett_execution_windows INTEGER DEFAULT 1
    );
  `);

    // ── Order Intelligence ──────────────────────────────────────────────────────────
    db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_number TEXT NOT NULL,
      status TEXT DEFAULT 'pending', -- pending, processed, shipped, delivered, cancelled
      payment_status TEXT DEFAULT 'pending', -- pending, paid, partial
      total_amount REAL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      items TEXT, -- JSON array of items
      delivery_charge REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      order_notes TEXT,
      shipping_address TEXT,
      tracking_id TEXT,
      scheduled_delivery TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      human_verified INTEGER DEFAULT 0,
      FOREIGN KEY (customer_number) REFERENCES customers(number)
    );
  `);

    // ── Payment Intelligence ────────────────────────────────────────────────────────
    db.run(`
    CREATE TABLE IF NOT EXISTS order_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      method TEXT DEFAULT 'cash',
      notes TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
  `);

    // ── AI Failsafe Architecture ──────────────────────────────────────────────────
    db.run(`
    CREATE TABLE IF NOT EXISTS ai_failsafe_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_number TEXT NOT NULL,
      original_query TEXT,
      payload TEXT, -- JSON blob of generation context
      status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
      retry_count INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    // ── Order Logging Architecture ────────────────────────────────────────────────
    db.run(`
    CREATE TABLE IF NOT EXISTS order_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      action TEXT NOT NULL, -- 'status_change', 'payment', 'merge', 'restoration'
      from_status TEXT,
      to_status TEXT,
      note TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
  `);

    // ── Performance Indexes ─────────────────────────────────
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp_status ON messages(timestamp, status);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_campaign_id ON messages(campaign_id);`);

    // CRM & Funnel Evolutions: Ensure existing databases get the new columns
    db.serialize(() => {
        const table = "customers";
        db.run(`ALTER TABLE ${table} ADD COLUMN lifecycle_stage TEXT DEFAULT 'lead'`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN lifetime_value REAL DEFAULT 0`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN sentiment_score INTEGER DEFAULT 100`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN funnel_notes TEXT`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN last_purchase TIMESTAMP`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN interest_score INTEGER DEFAULT 0`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN price_sensitivity_score INTEGER DEFAULT 0`, (err) => { });

        // AI Logs Intel column
        db.run(`ALTER TABLE ai_logs ADD COLUMN intel TEXT`, (err) => { });
        db.run(`ALTER TABLE ai_logs ADD COLUMN api_config_id INTEGER`, (err) => { });
        db.run(`ALTER TABLE ai_logs ADD COLUMN purpose TEXT`, (err) => { });
        db.run(`ALTER TABLE ai_logs ADD COLUMN input_tokens INTEGER`, (err) => { });
        db.run(`ALTER TABLE ai_logs ADD COLUMN output_tokens INTEGER`, (err) => { });
        db.run(`ALTER TABLE ai_logs ADD COLUMN total_tokens INTEGER`, (err) => { });
        db.run(`ALTER TABLE ai_logs ADD COLUMN cost REAL`, (err) => { });
        db.run(`ALTER TABLE ai_logs ADD COLUMN latency INTEGER`, (err) => { });
        db.run(`ALTER TABLE ai_logs ADD COLUMN detected_intent TEXT DEFAULT 'GENERAL'`, (err) => { });
        db.run(`ALTER TABLE ai_logs ADD COLUMN tokens_saved INTEGER DEFAULT 0`, (err) => { });

        // Order Intelligence Migration
        db.run(`ALTER TABLE orders ADD COLUMN delivery_charge REAL DEFAULT 0`, (err) => { });
        db.run(`ALTER TABLE orders ADD COLUMN discount REAL DEFAULT 0`, (err) => { });
        db.run(`ALTER TABLE orders ADD COLUMN order_notes TEXT`, (err) => { });
        db.run(`ALTER TABLE orders ADD COLUMN shipping_address TEXT`, (err) => { });
        db.run(`ALTER TABLE orders ADD COLUMN tracking_id TEXT`, (err) => { });
        db.run(`ALTER TABLE orders ADD COLUMN scheduled_delivery TIMESTAMP`, (err) => { });
        db.run(`ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'pending'`, (err) => { });
        db.run(`ALTER TABLE orders ADD COLUMN amount_paid REAL DEFAULT 0`, (err) => { 
            if (!err) {
                db.run("UPDATE orders SET payment_status = 'paid', amount_paid = CAST(REPLACE(total_amount, 'Tk', '') AS REAL) WHERE status IN ('delivered', 'processed') AND payment_status = 'pending'");
            }
        });
        db.run(`ALTER TABLE orders ADD COLUMN original_items TEXT`, (err) => { });
        db.run(`ALTER TABLE orders ADD COLUMN due_added REAL DEFAULT 0`, (err) => { });
        db.run(`ALTER TABLE customers ADD COLUMN previous_due REAL DEFAULT 0`, (err) => { });
        db.run(`ALTER TABLE customers ADD COLUMN saved_addresses TEXT DEFAULT '[]'`, (err) => { });
        db.run(`ALTER TABLE orders ADD COLUMN human_verified INTEGER DEFAULT 0`, (err) => { });
        db.run(`ALTER TABLE orders ADD COLUMN human_verified INTEGER DEFAULT 0`, (err) => { });
        // Procurement Intelligence Migration
        db.run(`ALTER TABLE stock_procurements ADD COLUMN batch_id TEXT`, (err) => { });
        db.run(`ALTER TABLE stock_procurements ADD COLUMN landed_cost REAL DEFAULT 0`, (err) => { });
        
        db.run(`ALTER TABLE orders ADD COLUMN is_debt_transferred INTEGER DEFAULT 0`, (err) => { });
        db.run(`ALTER TABLE orders ADD COLUMN debt_source_order_id INTEGER`, (err) => { });
        
        // Legacy Data Grouping: Backfill batch_id based on date and supplier for existing records
        db.run(`
            UPDATE stock_procurements 
            SET batch_id = 'BATCH-LEGACY-' || strftime('%Y%m%d', purchase_date) || '-' || abs(random() % 1000)
            WHERE batch_id IS NULL OR batch_id = ''
        `, (err) => { });
    });

    // ── Backwards Compatibility / Legacy view ─────────────────────────────────
    db.run(`
      CREATE VIEW IF NOT EXISTS scheduled_campaigns AS
      SELECT * FROM campaigns WHERE type = 'scheduled';
    `);

    // ── AI Brain Architecture ──────────────────────────────────────────────────
    db.run(`
    CREATE TABLE IF NOT EXISTS business_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT,
      about_text TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      address TEXT,
      delivery_charge_inside TEXT,
      delivery_charge_outside TEXT,
      delivery_timeframe TEXT,
      payment_methods TEXT,
      social_links TEXT,
      return_policy TEXT,
      refund_policy TEXT,
      shipping_policy TEXT,
      exchange_policy TEXT,
      operating_hours TEXT,
      main_website_url TEXT,
      ai_auto_reply_enabled TEXT DEFAULT 'false',
      embedding TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    // Migration for existing business_profiles table
    db.serialize(() => {
        db.run("ALTER TABLE business_profiles ADD COLUMN main_website_url TEXT", (err) => { /* ignore if already exists */ });
        db.run("ALTER TABLE business_profiles ADD COLUMN ai_auto_reply_enabled TEXT DEFAULT 'false'", (err) => { /* ignore if already exists */ });
        db.run("ALTER TABLE business_profiles ADD COLUMN embedding TEXT", (err) => { /* ignore if already exists */ });
    });

    db.run(`
    CREATE TABLE IF NOT EXISTS knowledge_pins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      knowledge_id INTEGER,
      item_id INTEGER,
      item_type TEXT, -- 'product' or 'category'
      FOREIGN KEY (knowledge_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE
    );
  `, (err) => {
    if (!err) {
        // Migration: Check if we need to migrate existing one-to-one pins
        db.get("SELECT COUNT(*) as count FROM knowledge_pins", (err, row) => {
            if (!err && row.count === 0) {
                // If pins table is empty, try to migrate from knowledge_documents.pinned_item_id
                db.all("SELECT id, pinned_item_id, type FROM knowledge_documents WHERE pinned_item_id IS NOT NULL", (err, docs) => {
                    if (!err && docs.length > 0) {
                        const stmt = db.prepare("INSERT INTO knowledge_pins(knowledge_id, item_id, item_type) VALUES(?, ?, ?)");
                        docs.forEach(d => {
                            const itemType = d.pinned_item_id > 1000 ? 'product' : 'category'; // Simple heuristic or just check catalog
                            // Actually, better to determine type from the doc type or just default to category if it matches categories
                            stmt.run(d.id, d.pinned_item_id, 'product'); 
                        });
                        stmt.finalize();
                        console.log(`[DB] Migrated ${docs.length} legacy pins to new join table.`);
                    }
                });
            }
        });
    }
  });

    db.run(`
    CREATE TABLE IF NOT EXISTS intelligent_product_catalog(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sku TEXT,
        price TEXT,
        regular_price TEXT,
        sale_price TEXT,
        description TEXT,
        full_description TEXT,
        image_url TEXT,
        product_url TEXT,
        variants TEXT,
        source TEXT DEFAULT 'scraper',
        manual_override INTEGER DEFAULT 0,
        vector_id TEXT,
        embedding TEXT,
        technical_attributes TEXT,
        stock_status INTEGER DEFAULT 1,
        stock_quantity INTEGER DEFAULT 0,
        purchase_price REAL DEFAULT 0,
        landed_cost REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    // Migration for intelligent_product_catalog (Enterprise Global Evolution)
    db.serialize(() => {
        const table = "intelligent_product_catalog";
        // Safely add any missing columns (idempotent)
        db.run(`ALTER TABLE ${table} ADD COLUMN full_description TEXT`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN variants TEXT`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN regular_price TEXT`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN sale_price TEXT`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN sku TEXT`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN technical_attributes TEXT`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN stock_status INTEGER DEFAULT 1`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN stock_quantity INTEGER DEFAULT 0`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN purchase_price REAL DEFAULT 0`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN landed_cost REAL DEFAULT 0`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN ai_attributes TEXT DEFAULT '{}'`, (err) => { });
        db.run(`ALTER TABLE ${table} ADD COLUMN ai_summary TEXT DEFAULT ''`, (err) => { });
    });

    db.run(`
    CREATE TABLE IF NOT EXISTS knowledge_documents(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT DEFAULT 'faq',
        is_pinned INTEGER DEFAULT 0,
        pinned_item_id INTEGER,
        response_style TEXT DEFAULT 'conversational',
        expiry_date TEXT,
        media_url TEXT,
        media_type TEXT,
        usage_count INTEGER DEFAULT 0,
        last_used_at TIMESTAMP,
        embedding TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `);

    db.serialize(() => {
        db.run("ALTER TABLE knowledge_documents ADD COLUMN expiry_date TEXT", (err) => { });
        db.run("ALTER TABLE knowledge_documents ADD COLUMN media_url TEXT", (err) => { });
        db.run("ALTER TABLE knowledge_documents ADD COLUMN media_type TEXT", (err) => { });
        db.run("ALTER TABLE knowledge_documents ADD COLUMN action_tag TEXT", (err) => { });
        db.run("ALTER TABLE knowledge_documents ADD COLUMN usage_count INTEGER DEFAULT 0", (err) => { });
        db.run("ALTER TABLE knowledge_documents ADD COLUMN last_used_at TIMESTAMP", (err) => { });
    });

    db.run(`
    CREATE TABLE IF NOT EXISTS intelligent_intents(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        intent_tag TEXT NOT NULL UNIQUE,
        media_url TEXT NOT NULL,
        media_type TEXT DEFAULT 'image',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `);

    db.run(`
    CREATE TABLE IF NOT EXISTS stock_procurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        variant_name TEXT,
        quantity INTEGER,
        purchase_price REAL,
        landed_cost REAL DEFAULT 0,
        batch_id TEXT,
        supplier TEXT,
        purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES intelligent_product_catalog(id)
    );
    `);

    db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT,
        amount REAL,
        description TEXT,
        type TEXT DEFAULT 'indirect', -- 'direct' (linked to batch) or 'indirect' (overhead)
        reference_id TEXT, -- batch_id if type is 'direct'
        paid_by TEXT DEFAULT 'self', -- 'self' or 'supplier'
        expense_date TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        created_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    `);

    db.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        phone TEXT,
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `);

    db.run(`
    CREATE TABLE IF NOT EXISTS supplier_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER,
        type TEXT NOT NULL, -- 'purchase', 'payment'
        amount REAL NOT NULL,
        reference_id TEXT, -- batch_id or manual payment ref
        note TEXT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
    );
    `);

    db.run(`
    CREATE TABLE IF NOT EXISTS product_categories(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        shipping_inside TEXT,
        shipping_outside TEXT,
        special_policy TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `);

    // Migration for existing tables (Enterprise Continuity)
    db.serialize(() => {
        // Knowledge Documents extensions
        db.run("ALTER TABLE knowledge_documents ADD COLUMN is_pinned INTEGER DEFAULT 0", (err) => { });
        db.run("ALTER TABLE knowledge_documents ADD COLUMN pinned_item_id INTEGER", (err) => { });
        db.run("ALTER TABLE knowledge_documents ADD COLUMN response_style TEXT DEFAULT 'conversational'", (err) => { });
        
        // Product Catalog extensions
        db.run("ALTER TABLE intelligent_product_catalog ADD COLUMN category_id INTEGER", (err) => { });
        
        // Seed default categories if needed
        db.run("INSERT OR IGNORE INTO product_categories (name) VALUES ('General')");
    });

    db.run(`
    CREATE TABLE IF NOT EXISTS crawler_frontier(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        process_id TEXT,
        url_hash TEXT,
        url TEXT,
        status TEXT DEFAULT 'pending', -- pending, visited, failed
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `);

    db.serialize(() => {
        db.run("ALTER TABLE expenses ADD COLUMN reference_id TEXT", (err) => { });
        db.run("ALTER TABLE expenses ADD COLUMN type TEXT DEFAULT 'indirect'", (err) => { });
        db.run("ALTER TABLE expenses ADD COLUMN paid_by TEXT DEFAULT 'self'", (err) => { 
            if (!err) {
                // Backfill for legacy data using description markers
                db.run("UPDATE expenses SET paid_by = 'supplier' WHERE description LIKE '%[Paid by supplier]%'");
                db.run("UPDATE expenses SET paid_by = 'self' WHERE description LIKE '%[Paid by self]%'");
            }
        });
        db.run("ALTER TABLE stock_procurements ADD COLUMN landed_cost REAL DEFAULT 0", (err) => { });
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_frontier_process_hash ON crawler_frontier(process_id, url_hash);`);

    // ── App Settings ──────────────────────────────────────────────────────────
    db.run(`
    CREATE TABLE IF NOT EXISTS app_settings(
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    `);

    // ── Active Execution State (Persistence) ──────────────────────────────────
    db.run(`
    CREATE TABLE IF NOT EXISTS active_executions(
        id TEXT PRIMARY KEY, --campaignId or processId
      target_name TEXT,
        scheduled_at TIMESTAMP,
        template_id INTEGER,
        current_index INTEGER DEFAULT 0,
        total_recipients INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending', --pending, running, completed, cancelled, paused
      delayMin INTEGER,
        delayMax INTEGER,
        execution_windows TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `);

    // ── Media Assets (SIS) ───────────────────────────────────────────────────
    db.run(`
    CREATE TABLE IF NOT EXISTS media_assets(
        hash TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        type TEXT NOT NULL,
        filename TEXT,
        is_protected INTEGER DEFAULT 0, --Protected templates won't have their assets deleted
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `);

    // ── WhatsApp Account Metadata (Professional Auto-Connect) ────────────────
    db.run(`
    CREATE TABLE IF NOT EXISTS whatsapp_accounts(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wid TEXT UNIQUE,
        number TEXT,
        name TEXT,
        platform TEXT,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `);
 
    // ── Enterprise Outbox (Persistence Guard) ────────────────
    db.run(`
    CREATE TABLE IF NOT EXISTS outgoing_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        text TEXT,
        media_payload TEXT, -- JSON string for path, type, attachments
        options TEXT, -- JSON string for send-options
        metadata TEXT, -- JSON string for internal tracking
        status TEXT DEFAULT 'pending', -- pending, sending, sent, failed
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `);
    
    db.run(`CREATE INDEX IF NOT EXISTS idx_outbox_status_retries ON outgoing_queue(status, retry_count);`);
    
    // ── AI Generation Queue (Retry Guard) ────────────────
    db.run(`
    CREATE TABLE IF NOT EXISTS ai_generation_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        user_message TEXT,
        payload TEXT, -- JSON string containing context, history, profile, etc.
        status TEXT DEFAULT 'pending', -- pending, processing, failed, completed
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_ai_queue_status ON ai_generation_queue(status, retry_count);`);

    // Seed default scheduler delay settings if not set
    const defaultSettings = [
        { k: 'scheduler_delay_min_ms', v: '15000' },
        { k: 'scheduler_delay_max_ms', v: '25000' },
        { k: 'daily_limit', v: '600' },
        // Human Behavior & Protection Settings (New Phase 17/18)
        { k: 'batch_min', v: '30' },
        { k: 'batch_max', v: '50' },
        { k: 'break_min_ms', v: '120000' }, // 2 mins
        { k: 'break_max_ms', v: '300000' }, // 5 mins
        { k: 'enable_jitter', v: 'true' },
        { k: 'enable_daily_limit', v: 'true' },
        { k: 'enable_batching', v: 'true' },
        { k: 'enable_windows', v: 'true' },
        { k: 'execution_windows', v: '[{"start":"09:00","end":"12:00"},{"start":"20:00","end":"22:00"}]' },
        { k: 'timezone_offset', v: '360' }, // Default to UTC+6 (Bangladesh)
        { k: 'carry_over_limit', v: '0' },
        { k: 'ai_tagging_rules', v: '1. Assign #HighValue if strong purchase intent is detected.\n2. Assign #PriceSensitive if they negotiate or ask for discounts.\n3. Assign #Returning if they mention or reference a previous order.' },
        { k: 'ai_persona', v: 'You are a world-class senior sales representative. You are professional, empathetic, knowledgeable, and focused on delivering a premium customer experience.' },
        { k: 'ai_tone_guide', v: '- Sound like a real, warm human — never robotic or template-like.\n- Automatically detect and match the customer\'s language (Bangla, English, or mixed).\n- Use emojis naturally and sparingly.\n- Be concise. Don\'t repeat information unnecessarily.\n- Never use time-stamps or filler words like "today" / "আজ" unless the customer used them first.\n- Greeting: Use warm, culturally appropriate greetings. For general Bengali greetings, prefer "আসসালামু আলাইকুম" or "হ্যালো". Do NOT use "নমস্কার" as a default unless the customer uses it first.\n- Avoid robotic phrases like "আমি কিভাবে আপনাকে সাহায্য করতে পারি আজ?" (uses \'আজ\' unnecessarily). Instead, use natural phrases like "কিভাবে সাহায্য করতে পারি বলুন? 😊" or "বলুন, কিভাবে সাহায্য করতে পারি?"\n- Handling Out-of-Stock / Unavailable Items: When a product is not in the catalog or is out of stock, do NOT use robotic database jargon like "আমাদের ক্যাটালগে তালিকাভুক্ত নেই", "তালিকাভুক্ত নেই", or "সিস্টেমে নেই". Instead, say: "দুঃখিত, এই মুহূর্তে আমাদের কাছে [আইটেমের নাম] নেই।" or "দুঃখিত, আজকে আমাদের কালেকশনে [আইটেমের নাম] নেই।" Then naturally suggest other available products.' },
        { k: 'ai_funnel_rules', v: 'STAGE 1 — BROWSING (Customer is exploring):\n- Customer asks about price, size, color, availability, or product details.\n- Action: Provide ONLY the requested info. Close with a friendly open-ended question to keep dialogue flowing.\n- FORBIDDEN: Do NOT ask for Name, Address, or Phone Number at this stage.\n\nSTAGE 2 — BUYING INTENT (Customer explicitly wants to order):\n- Triggered by: "অর্ডার করবো", "how to order", "I want this", or confirming a size/color to buy.\n- Action: Summarize chosen items. State shipping charges. Ask for: Full Name, Complete Delivery Address, Phone Number.\n\nSTAGE 3 — FINAL CONFIRMATION (All details collected):\n- Present a clean order review. Ask for explicit final confirmation.\n- ONLY append [ACTION: PLACE_ORDER] when customer says "Yes", "Confirm", or equivalent affirmation.' },
        { k: 'ai_stage3_template', v: 'Please review your order before I confirm:\n📦 Items: [LIST_ITEMS]\n💰 Total: [TOTAL_AMOUNT] (shipping included)\n📍 Address: [DELIVERY_ADDRESS]\n📞 Phone: [PHONE]\n\nShall I go ahead and confirm this order?' }
    ];

    defaultSettings.forEach(s => {
        db.run(`INSERT OR IGNORE INTO app_settings(key, value) VALUES(?, ?)`, [s.k, s.v]);
    });

    // Seed initial AI API Config if empty
    db.get("SELECT COUNT(*) as count FROM ai_api_configs", (err, row) => {
        if (!err && row.count === 0 && process.env.GEMINI_API_KEY) {
            db.run(`
                INSERT INTO ai_api_configs (name, provider, api_key, model, is_primary)
                VALUES (?, ?, ?, ?, ?)
            `, ["Default Gemini", "google", process.env.GEMINI_API_KEY, "gemini-2.5-flash-lite", 1]);
            console.log("[DB] Seeded initial AI API configuration from .env");
        }
    });

    const columns = [
        { table: 'messages', name: 'whatsapp_id', type: 'TEXT' },
        { table: 'messages', name: 'media_path', type: 'TEXT' },
        { table: 'messages', name: 'media_type', type: 'TEXT' },
        { table: 'templates', name: 'media_path', type: 'TEXT' },
        { table: 'templates', name: 'media_type', type: 'TEXT' },
        { table: 'messages', name: 'reaction', type: 'TEXT' },
        { table: 'messages', name: 'quoted_msg_body', type: 'TEXT' },
        { table: 'scheduled_campaigns', name: 'created_at', type: 'TEXT' },
        { table: 'scheduled_campaigns', name: 'paused_at', type: 'TEXT' },
        { table: 'scheduled_campaigns', name: 'is_adjusted', type: 'INTEGER DEFAULT 0' },
        { table: 'scheduled_campaigns', name: 'original_scheduled_at', type: 'TEXT' },
        { table: 'scheduled_campaigns', name: 'template_id', type: 'INTEGER' },
        { table: 'campaigns', name: 'type', type: 'TEXT DEFAULT "instant"' },
        { table: 'messages', name: 'metadata', type: 'TEXT' },
        { table: 'customers', name: 'tags', type: 'TEXT DEFAULT "[]"' },
        { table: 'customers', name: 'engagement_score', type: 'INTEGER DEFAULT 0' },
        { table: 'templates', name: 'usage_count', type: 'INTEGER DEFAULT 0' },
        { table: 'templates', name: 'is_pinned', type: 'INTEGER DEFAULT 0' },
        { table: 'customers', name: 'email', type: 'TEXT' },
        { table: 'customers', name: 'address', type: 'TEXT' },
        { table: 'customers', name: 'city', type: 'TEXT' },
        { table: 'customers', name: 'company_name', type: 'TEXT' },
        { table: 'customers', name: 'last_purchase', type: 'TEXT' },
        { table: 'messages', name: 'campaign_id', type: 'INTEGER' },
        { table: 'customers', name: 'ai_paused', type: 'INTEGER DEFAULT 0' },
        { table: 'customers', name: 'handover_requested', type: 'INTEGER DEFAULT 0' },
        { table: 'customers', name: 'ai_memory_summary', type: 'TEXT' },
        { table: 'customers', name: 'last_summary_at', type: 'TIMESTAMP' },
        { table: 'customers', name: 'interest_score', type: 'INTEGER DEFAULT 0' },
        { table: 'customers', name: 'price_sensitivity_score', type: 'INTEGER DEFAULT 0' },
        { table: 'customers', name: 'loyalty_score', type: 'INTEGER DEFAULT 0' }
    ];

    columns.forEach(col => {
        db.run(`ALTER TABLE ${col.table} ADD COLUMN ${col.name} ${col.type} `, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                // Ignore
            }
        });
    });

    // Fix legacy scheduled_campaigns constraint if missing & migrate to campaigns
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_campaigns'", (err, row) => {
        if (row) {
            console.log("Migrating legacy scheduled_campaigns to unified campaigns table...");
            db.serialize(() => {
                db.run("PRAGMA foreign_keys=OFF");
                db.run("BEGIN TRANSACTION");

                // Copy existing to new campaigns structure
                db.run(`
                    INSERT INTO campaigns(
        id, name, message, type, target_type, target_id, target_name,
        scheduled_at, status, sent_count, fail_count,
        total_recipients, template_id, created_at, paused_at,
        is_adjusted, original_scheduled_at, delayMin, delayMax, execution_windows
    )
    SELECT
    id, name, message, 'scheduled', target_type, target_id, target_name,
        scheduled_at, status, sent_count, fail_count,
        total_recipients, template_id, created_at, paused_at,
        is_adjusted, original_scheduled_at,
        COALESCE(delayMin, 0), COALESCE(delayMax, 0), COALESCE(execution_windows, '[]')
                    FROM scheduled_campaigns
                    WHERE NOT EXISTS(SELECT 1 FROM campaigns WHERE campaigns.id = scheduled_campaigns.id)
        `, (err) => {
                    if (!err) {
                        db.run("DROP TABLE scheduled_campaigns");
                        db.run(`
                          CREATE VIEW IF NOT EXISTS scheduled_campaigns AS
    SELECT * FROM campaigns WHERE type = 'scheduled';
    `);
                        db.run("COMMIT");
                        db.run("PRAGMA foreign_keys=ON");
                    } else {
                        console.error("Migration failed, rolling back", err);
                        db.run("ROLLBACK");
                        db.run("PRAGMA foreign_keys=ON");
                    }
                });
            });
        }
    });
});

const dbUtils = {
    // Messages
    addMessage: async (number, text, timestamp, status, type = 'sent', whatsappId = null, mediaPath = null, mediaType = null, reaction = null, quotedMsg = null, metadata = null, campaignId = null) => {
        const cleanNumber = formatNumber(number);
        try { await dbUtils.syncCustomer(null, cleanNumber); } catch (e) { }

        // Prevent duplicates
        if (whatsappId) {
            const existing = await new Promise((resolve) => {
                db.get('SELECT id FROM messages WHERE whatsapp_id = ?', [whatsappId], (err, row) => resolve(row));
            });
            if (existing) return existing;
        }

        try {
            const fs = require('fs');
            fs.appendFileSync(require('path').join(__dirname, 'debug.log'), `[${new Date().toISOString()}][DB] addMessage: number = ${number}, campaignId = ${campaignId} \n`);
        } catch (e) { }

        return new Promise((resolve, reject) => {
            const stmt = db.prepare('INSERT OR IGNORE INTO messages (number, text, timestamp, status, type, whatsapp_id, media_path, media_type, reaction, quoted_msg_body, metadata, campaign_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            stmt.run(cleanNumber, text, timestamp, status, type, whatsappId, mediaPath, mediaType, reaction, quotedMsg, metadata, campaignId, function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
            stmt.finalize();
        });
    },
    updateMessageStatus: (whatsappId, status) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('UPDATE messages SET status = ? WHERE whatsapp_id = ?');
            stmt.run(status, whatsappId, function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
            stmt.finalize();
        });
    },
    getMessages: () => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT m.*, m.quoted_msg_body as quotedMsg, c.name as contactName 
                FROM messages m 
                LEFT JOIN customers c ON m.number = c.number 
                ORDER BY m.id DESC LIMIT 500
        `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    getMessagesPaginated: ({ page = 1, limit = 50, status, dateFrom, dateTo, search, campaignId, templateId, mediaType }) => {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT m.*, m.quoted_msg_body as quotedMsg, c.name as contactName 
                FROM messages m 
                LEFT JOIN customers c ON m.number = c.number 
                ${templateId ? 'INNER JOIN campaigns cp ON m.campaign_id = cp.id' : ''}
                WHERE 1 = 1
        `;
            const params = [];

            if (status) {
                if (status === 'replied') {
                    query += ` AND m.type = 'received'`;
                } else {
                    query += ` AND m.status = ? `;
                    params.push(status);
                }
            }
            if (dateFrom) {
                query += ` AND m.timestamp >= ? `;
                params.push(dateFrom);
            }
            if (dateTo) {
                query += ` AND m.timestamp <= ? `;
                params.push(dateTo);
            }
            if (campaignId) {
                query += ` AND m.campaign_id = ? `;
                params.push(campaignId);
            }
            if (templateId) {
                query += ` AND cp.template_id = ? `;
                params.push(templateId);
            }
            if (mediaType) {
                if (mediaType === 'text') {
                    query += ` AND(m.media_type IS NULL OR m.media_type = 'chat' OR m.media_type = '')`;
                } else {
                    query += ` AND m.media_type = ? `;
                    params.push(mediaType);
                }
            }
            if (search) {
                query += ` AND(m.number LIKE ? OR m.text LIKE ? OR c.name LIKE ?)`;
                const searchParam = `% ${search}% `;
                params.push(searchParam, searchParam, searchParam);
            }

            const countQuery = query.replace('SELECT m.*, m.quoted_msg_body as quotedMsg, c.name as contactName', 'SELECT COUNT(m.id) as total');

            query += ` ORDER BY m.id DESC LIMIT ? OFFSET ? `;
            const offset = (page - 1) * limit;

            db.get(countQuery, params, (err, countRow) => {
                if (err) return reject(err);
                const total = countRow.total;

                db.all(query, [...params, limit, offset], (err, rows) => {
                    if (err) reject(err);
                    else resolve({ data: rows, total, page: Number(page), limit: Number(limit) });
                });
            });
        });
    },
    getChatHistory: (number, lastMsgId = null, limit = 30) => {
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            let query = `
                SELECT m.*, m.quoted_msg_body as quotedMsg, c.name as contactName 
                FROM messages m 
                LEFT JOIN customers c ON m.number = c.number 
                WHERE m.number = ?
        `;
            const params = [cleanNumber];

            if (lastMsgId) {
                // Fetch messages with ID less than the anchor message to go back in history
                query += ` AND m.id < (SELECT id FROM messages WHERE whatsapp_id = ? OR id = ? LIMIT 1)`;
                params.push(lastMsgId, lastMsgId);
            }

            query += ` ORDER BY m.id DESC LIMIT ? `;
            params.push(limit);

            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else {
                    // Map database results and ensure they are Old-to-New (ASC)
                    // Rows are fetched DESC, so we reverse them
                    const mapped = rows.map(row => ({
                        ...row,
                        whatsappId: row.whatsapp_id,
                        media_path: row.media_path,
                        media_type: row.media_type
                    })).reverse();
                    resolve(mapped);
                }
            });
        });
    },
    bulkDeleteMessages: (ids) => {
        return new Promise((resolve, reject) => {
            if (!ids || ids.length === 0) return resolve({ success: true, deleted: 0 });
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                const placeholders = ids.map(() => '?').join(',');
                db.run(`DELETE FROM messages WHERE id IN(${placeholders})`, ids, function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }
                    const deletedCount = this.changes;
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) reject(commitErr);
                        else resolve({ success: true, deleted: deletedCount });
                    });
                });
            });
        });
    },
    updateMessageReaction: (whatsappId, reaction) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('UPDATE messages SET reaction = ? WHERE whatsapp_id = ?');
            stmt.run(reaction, whatsappId, function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
            stmt.finalize();
        });
    },

    // Customers
    addCustomer: (data) => {
        const { name, number, email, address, city, companyName, lastPurchase, saved_addresses = '[]' } = data;
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('INSERT OR IGNORE INTO customers (name, number, email, address, city, company_name, last_purchase, saved_addresses) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            stmt.run(name, cleanNumber, email, address, city, companyName, lastPurchase, saved_addresses, function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
            stmt.finalize();
        });
    },
    getCustomers: () => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT c.*, GROUP_CONCAT(g.name) as groupNames, GROUP_CONCAT(g.id) as groupIds
                FROM customers c
                LEFT JOIN contact_groups cg ON c.id = cg.contact_id
                LEFT JOIN groups g ON cg.group_id = g.id
                GROUP BY c.id
    `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    updateCustomer: (id, data) => {
        const { name, number, email, address, city, companyName, lastPurchase, saved_addresses } = data;
        const cleanNumber = number ? formatNumber(number) : undefined;
        return new Promise((resolve, reject) => {
            const fields = [];
            const params = [];
            if (name !== undefined) { fields.push('name = ?'); params.push(name); }
            if (cleanNumber !== undefined) { fields.push('number = ?'); params.push(cleanNumber); }
            if (email !== undefined) { fields.push('email = ?'); params.push(email); }
            if (address !== undefined) { fields.push('address = ?'); params.push(address); }
            if (city !== undefined) { fields.push('city = ?'); params.push(city); }
            if (companyName !== undefined) { fields.push('company_name = ?'); params.push(companyName); }
            if (lastPurchase !== undefined) { fields.push('last_purchase = ?'); params.push(lastPurchase); }
            if (saved_addresses !== undefined) { fields.push('saved_addresses = ?'); params.push(saved_addresses); }

            if (fields.length === 0) return resolve({ success: true });

            params.push(id);
            const query = `UPDATE customers SET ${fields.join(', ')} WHERE id = ?`;
            db.run(query, params, function (err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            });
        });
    },

    manageSavedAddress: (number, action, addressData) => {
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            db.get('SELECT saved_addresses FROM customers WHERE number = ?', [cleanNumber], (err, row) => {
                if (err) return reject(err);
                let addresses = [];
                try { addresses = JSON.parse(row?.saved_addresses || '[]'); } catch (e) { }

                if (action === 'add') {
                    // Check if address already exists
                    const existing = addresses.find(a => a.address.trim() === addressData.address.trim());
                    if (existing) {
                        existing.tag = addressData.tag || existing.tag;
                        existing.usage_count = (existing.usage_count || 0) + 1;
                    } else {
                        addresses.push({
                            address: addressData.address.trim(),
                            tag: addressData.tag || 'Home',
                            is_verified: addressData.is_verified || false,
                            usage_count: 1,
                            created_at: new Date().toISOString()
                        });
                    }
                } else if (action === 'remove') {
                    addresses = addresses.filter(a => a.address.trim() !== addressData.address.trim());
                } else if (action === 'verify') {
                    const target = addresses.find(a => a.address.trim() === addressData.address.trim());
                    if (target) target.is_verified = true;
                }

                db.run('UPDATE customers SET saved_addresses = ? WHERE number = ?', [JSON.stringify(addresses), cleanNumber], (upErr) => {
                    if (upErr) reject(upErr);
                    else resolve({ success: true, count: addresses.length });
                });
            });
        });
    },
    updateCustomerTags: (id, tags) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('UPDATE customers SET tags = ? WHERE id = ?');
            stmt.run(JSON.stringify(tags), id, function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
            stmt.finalize();
        });
    },
    updateCustomerScore: (id, score) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('UPDATE customers SET engagement_score = ? WHERE id = ?');
            stmt.run(score, id, function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
            stmt.finalize();
        });
    },
    deleteCustomer: (id) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('DELETE FROM customers WHERE id = ?', [id]);
                // With CASCADE enabled on FOREIGN KEY (contact_id) REFERENCES customers(id),
                // we don't strictly need the next line, but keeping for safety if cascade isn't active on current DB session
                db.run('DELETE FROM contact_groups WHERE contact_id = ?', [id], (err) => {
                    if (err) reject(err);
                    else resolve({ success: true });
                });
            });
        });
    },
    bulkDeleteCustomers: (ids) => {
        return new Promise((resolve, reject) => {
            if (!ids || ids.length === 0) return resolve({ success: true, deleted: 0 });

            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                const placeholders = ids.map(() => '?').join(',');
                db.run(`DELETE FROM customers WHERE id IN(${placeholders})`, ids, function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }
                    const deletedCount = this.changes;
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) reject(commitErr);
                        else resolve({ success: true, deleted: deletedCount });
                    });
                });
            });
        });
    },
    syncCustomer: (name, number) => {
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            // First, find if we have this number
            db.get('SELECT * FROM customers WHERE number = ?', [cleanNumber], (err, row) => {
                if (err) return reject(err);

                if (!row) {
                    // New customer
                    const stmt = db.prepare('INSERT INTO customers (name, number) VALUES (?, ?)');
                    stmt.run(name || 'Unknown', cleanNumber, function (insErr) {
                        if (insErr) reject(insErr);
                        else resolve({ id: this.lastID, action: 'created' });
                    });
                    stmt.finalize();
                } else {
                    // Existing customer - Update name only if it was Unknown and new name is better
                    // Ensure we don't overwrite detailed data with "Unknown"
                    const currentName = row.name || 'Unknown';
                    const newName = name || 'Unknown';

                    if (newName !== 'Unknown' && (currentName === 'Unknown' || !currentName)) {
                        db.run('UPDATE customers SET name = ? WHERE id = ?', [newName, row.id], (upErr) => {
                            if (upErr) reject(upErr);
                            else resolve({ id: row.id, action: 'updated_name' });
                        });
                    } else {
                        resolve({ id: row.id, action: 'none' });
                    }
                }
            });
        });
    },
    updateCustomerIntel: (number, data) => {
        const cleanNumber = formatNumber(number);
        
        // Flatten nested extraction data if coming from AI "extract" block
        const mergedData = { ...data };
        if (data.extract) {
            Object.assign(mergedData, data.extract);
        }

        return new Promise((resolve, reject) => {
            // First, fetch current status to handle smart transitions
            db.get('SELECT lifecycle_stage, name, address, city FROM customers WHERE number = ?', [cleanNumber], (err, current) => {
                if (err) return reject(err);

                const fields = [];
                const params = [];

                if (mergedData.name) { fields.push('name = ?'); params.push(mergedData.name); }
                if (mergedData.email) { fields.push('email = ?'); params.push(mergedData.email); }
                if (mergedData.address) { fields.push('address = ?'); params.push(mergedData.address); }
                if (mergedData.city) { fields.push('city = ?'); params.push(mergedData.city); }
                if (mergedData.funnel_notes) { fields.push('funnel_notes = ?'); params.push(mergedData.funnel_notes); }
                if (mergedData.sentiment_score !== undefined) { fields.push('sentiment_score = ?'); params.push(mergedData.sentiment_score); }
                
                // AUTOMATION: Lifecycle Upgrade
                // If we have both name, address and phone (either in DB or new data)
                // and current stage is 'lead', upgrade to 'prospect' or 'customer'
                let targetStage = mergedData.lifecycle_stage;
                const hasAddress = mergedData.address || (current && current.address);
                const isLead = current && current.lifecycle_stage === 'lead';
                
                if (!targetStage && isLead) {
                    if (hasAddress) {
                        targetStage = 'prospect';
                    }
                }

                if (targetStage) {
                    fields.push('lifecycle_stage = ?');
                    params.push(targetStage);
                }

                // Handle tags if provided (merge with existing)
                if (mergedData.tags && Array.isArray(mergedData.tags)) {
                    db.get('SELECT tags FROM customers WHERE number = ?', [cleanNumber], (err, row) => {
                        if (row) {
                            let currentTags = [];
                            try { currentTags = JSON.parse(row.tags || '[]'); } catch (e) {}
                            const newTags = Array.from(new Set([...currentTags, ...mergedData.tags]));
                            db.run('UPDATE customers SET tags = ? WHERE number = ?', [JSON.stringify(newTags), cleanNumber]);
                        }
                    });
                }

                if (fields.length === 0) return resolve({ success: true });

                params.push(cleanNumber);
                db.run(`UPDATE customers SET ${fields.join(', ')} WHERE number = ?`, params, function (upErr) {
                    if (upErr) reject(upErr);
                    else resolve({ success: true, changes: this.changes, upgraded: targetStage && targetStage !== current?.lifecycle_stage });
                });
            });
        });
    },
    incrementCustomerSpent: (number, amount) => {
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE customers SET lifetime_value = lifetime_value + ?, lifecycle_stage = "customer" WHERE number = ?',
                [amount, cleanNumber],
                function (err) {
                    if (err) reject(err);
                    else resolve({ success: true, changes: this.changes });
                }
            );
        });
    },

    getConversationContext: (number, limit = 10) => {
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT type, text FROM messages 
                WHERE number = ? 
                ORDER BY id DESC LIMIT ?
            `, [cleanNumber, limit], (err, rows) => {
                if (err) reject(err);
                else {
                    // Return Oldest to Newest for LLM context, condensing AI responses to keep token footprint lean
                    const history = rows.reverse().map(m => {
                        const cleanText = (m.text || '').replace(/\[INTEL:[\s\S]*$/gi, '').replace(/\s+/g, ' ').trim();
                        const truncated = m.type === 'sent' && cleanText.length > 140 ? cleanText.slice(0, 137) + '...' : cleanText;
                        return `${m.type === 'received' ? 'Customer' : 'AI'}: ${truncated}`;
                    }).join('\n');
                    resolve(history);
                }
            });
        });
    },

    getEnhancedConversationContext: (number, messageLimit = 10) => {
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            // 1. Fetch Summary + Last Messages in one flow
            db.get(`SELECT ai_memory_summary FROM customers WHERE number = ?`, [cleanNumber], (err, customer) => {
                if (err) return reject(err);
                
                db.all(`
                    SELECT type, text FROM messages 
                    WHERE number = ? 
                    ORDER BY id DESC LIMIT ?
                `, [cleanNumber, messageLimit], (msgErr, rows) => {
                    if (msgErr) return reject(msgErr);
                    
                    const rawHistory = rows.reverse().map(m => `${m.type === 'received' ? 'Customer' : 'AI'}: ${m.text}`).join('\n');
                    const summary = customer?.ai_memory_summary ? `[PREVIOUS SUMMARY: ${customer.ai_memory_summary}]\n---\n` : "";
                    
                    resolve({
                        fullContext: `${summary}${rawHistory}`,
                        currentSummary: customer?.ai_memory_summary || "",
                        rawCount: rows.length
                    });
                });
            });
        });
    },

    getCustomerAIStatus: (number) => {
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            db.get('SELECT ai_paused, handover_requested FROM customers WHERE number = ?', [cleanNumber], (err, row) => {
                if (err) reject(err);
                else resolve(row || { ai_paused: 0, handover_requested: 0 });
            });
        });
    },

    updateCustomerAIStatusByNumber: (number, { ai_paused, handover_requested }) => {
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            const fields = [];
            const params = [];
            if (ai_paused !== undefined) { fields.push('ai_paused = ?'); params.push(ai_paused); }
            if (handover_requested !== undefined) { fields.push('handover_requested = ?'); params.push(handover_requested); }
            
            if (fields.length === 0) return resolve({ success: true });
            
            params.push(cleanNumber);
            db.run(`UPDATE customers SET ${fields.join(', ')} WHERE number = ?`, params, function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    },

    updateCustomerSummary: (number, summary) => {
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            db.run(`UPDATE customers SET ai_memory_summary = ?, last_summary_at = CURRENT_TIMESTAMP WHERE number = ?`, [summary, cleanNumber], function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    },
    getCustomerByNumber: (number) => {
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM customers WHERE number = ?', [cleanNumber], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    updateCustomerMetrics: (number, metrics) => {
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            const fields = [];
            const params = [];
            
            if (metrics.interest_score !== undefined) { fields.push('interest_score = ?'); params.push(metrics.interest_score); }
            if (metrics.price_sensitivity_score !== undefined) { fields.push('price_sensitivity_score = ?'); params.push(metrics.price_sensitivity_score); }
            if (metrics.loyalty_score !== undefined) { fields.push('loyalty_score = ?'); params.push(metrics.loyalty_score); }
            if (metrics.engagement_score !== undefined) { fields.push('engagement_score = ?'); params.push(metrics.engagement_score); }
            
            if (fields.length === 0) return resolve({ success: true });
            
            params.push(cleanNumber);
            db.run(`UPDATE customers SET ${fields.join(', ')} WHERE number = ?`, params, function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    },
    updateCustomerTags: (id, tags) => {
        return new Promise((resolve, reject) => {
            db.run('UPDATE customers SET tags = ? WHERE id = ?', [tags, id], function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    },

    updateCustomerAIStatus: (id, { ai_paused, handover_requested }) => {
        return new Promise((resolve, reject) => {
            const fields = [];
            const params = [];
            if (ai_paused !== undefined) { fields.push('ai_paused = ?'); params.push(ai_paused); }
            if (handover_requested !== undefined) { fields.push('handover_requested = ?'); params.push(handover_requested); }
            
            if (fields.length === 0) return resolve({ success: true });
            
            params.push(id);
            db.run(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`, params, function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    },

    // Groups
    getGroups: () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM groups', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    addGroup: (name, description = '') => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('INSERT INTO groups (name, description) VALUES (?, ?)');
            stmt.run(name, description, function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, name });
            });
            stmt.finalize();
        });
    },
    deleteGroup: (id) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM groups WHERE id = ?', [id], function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    },
    getContactsByGroup: (groupId) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT c.*, GROUP_CONCAT(g2.name) as groupNames, GROUP_CONCAT(g2.id) as groupIds
                FROM customers c
                JOIN contact_groups cg ON c.id = cg.contact_id
                LEFT JOIN contact_groups cg2 ON c.id = cg2.contact_id
                LEFT JOIN groups g2 ON cg2.group_id = g2.id
                WHERE cg.group_id = ?
    GROUP BY c.id
        `, [groupId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    addContactToGroup: (contactId, groupId) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('INSERT OR IGNORE INTO contact_groups (contact_id, group_id) VALUES (?, ?)');
            stmt.run(contactId, groupId, function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
            stmt.finalize();
        });
    },
    syncGroupContacts: (groupId, contactIds) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('DELETE FROM contact_groups WHERE group_id = ?', [groupId]);
                const stmt = db.prepare('INSERT INTO contact_groups (contact_id, group_id) VALUES (?, ?)');
                contactIds.forEach(id => stmt.run(id, groupId));
                stmt.finalize((err) => {
                    if (err) reject(err);
                    else resolve({ success: true });
                });
            });
        });
    },

    // Remove a single contact from a specific group only (does NOT delete the contact from the system)
    removeContactFromGroup: (contactId, groupId) => {
        return new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM contact_groups WHERE contact_id = ? AND group_id = ?',
                [contactId, groupId],
                function (err) {
                    if (err) reject(err);
                    else resolve({ success: true, changes: this.changes });
                }
            );
        });
    },

    bulkAddContactsWithGroup: async (contacts, groupId) => {
        const results = [];
        for (const contact of contacts) {
            const cleanNumber = formatNumber(contact.number);
            const res = await dbUtils.syncCustomer(contact.name, cleanNumber);
            if (groupId) {
                await dbUtils.addContactToGroup(res.id, groupId);
            }
            results.push(res);
        }
        return results;
    },

    // Templates
    getTemplates: () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM templates ORDER BY created_at DESC', [], (err, rows) => {
                if (err) return reject(err);

                // Parse media_path as JSON if possible, for multiple attachments
                const parsedRows = rows.map(row => {
                    let parsedMediaPath = row.media_path;
                    let parsedMediaType = row.media_type;
                    let attachments = [];

                    if (row.media_path) {
                        try {
                            const parsed = JSON.parse(row.media_path);
                            if (Array.isArray(parsed)) {
                                attachments = parsed;
                                // For backward compatibility, keep the first one as media_path/type
                                if (parsed.length > 0) {
                                    parsedMediaPath = parsed[0].url;
                                    parsedMediaType = parsed[0].type;
                                }
                            } else {
                                // Backward comp for string
                                attachments = [{ url: row.media_path, type: row.media_type }];
                            }
                        } catch (e) {
                            // Valid string path, not JSON
                            attachments = [{ url: row.media_path, type: row.media_type }];
                        }
                    }
                    return {
                        ...row,
                        media_path: parsedMediaPath,
                        media_type: parsedMediaType,
                        attachments: attachments
                    };
                });
                resolve(parsedRows);
            });
        });
    },
    addTemplate: (title, content, category = 'General', media_path = null, media_type = null, attachments = null) => {
        return new Promise((resolve, reject) => {
            let finalMediaPath = media_path;
            if (attachments && Array.isArray(attachments) && attachments.length > 0) {
                finalMediaPath = JSON.stringify(attachments);
            }

            const stmt = db.prepare('INSERT INTO templates (title, content, category, media_path, media_type) VALUES (?, ?, ?, ?, ?)');
            stmt.run(title, content, category, finalMediaPath, media_type, function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
            stmt.finalize();
        });
    },
    updateTemplate: (id, title, content, category, media_path, media_type, attachments = null) => {
        return new Promise((resolve, reject) => {
            let finalMediaPath = media_path;
            if (attachments && Array.isArray(attachments)) {
                finalMediaPath = attachments.length > 0 ? JSON.stringify(attachments) : null;
            }

            const stmt = db.prepare('UPDATE templates SET title = ?, content = ?, category = ?, media_path = ?, media_type = ? WHERE id = ?');
            stmt.run(title, content, category, finalMediaPath, media_type, id, function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
            stmt.finalize();
        });
    },
    deleteTemplate: (id) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('DELETE FROM templates WHERE id = ?');
            stmt.run(id, function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
            stmt.finalize();
        });
    },
    getTemplateById: (id) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM templates WHERE id = ?', [id], (err, row) => {
                if (err) return reject(err);
                if (!row) return resolve(null);

                // Parse media_path as JSON if possible, for multiple attachments
                let parsedMediaPath = row.media_path;
                let parsedMediaType = row.media_type;
                let attachments = [];

                if (row.media_path) {
                    try {
                        const parsed = JSON.parse(row.media_path);
                        if (Array.isArray(parsed)) {
                            attachments = parsed;
                            // For backward compatibility, keep the first one as media_path/type
                            if (parsed.length > 0) {
                                parsedMediaPath = parsed[0].url;
                                parsedMediaType = parsed[0].type;
                            }
                        } else {
                            // Backward comp for string
                            attachments = [{ url: row.media_path, type: row.media_type }];
                        }
                    } catch (e) {
                        // Valid string path, not JSON
                        attachments = [{ url: row.media_path, type: row.media_type }];
                    }
                }
                resolve({
                    ...row,
                    media_path: parsedMediaPath,
                    media_type: parsedMediaType,
                    attachments: attachments
                });
            });
        });
    },

    getPeakHourAnalytics: (templateId = null, startDate = null, endDate = null) => {
        return new Promise((resolve, reject) => {
            let query = `
SELECT
strftime('%H', timestamp) as hour,
    COUNT(id) as total_sent,
    SUM(CASE WHEN status IN('delivered', 'read') THEN 1 ELSE 0 END) as delivered,
    SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read,
    SUM(responded) as responses
                FROM template_analytics
                WHERE timestamp IS NOT NULL
    `;
            const params = [];
            if (templateId) {
                query += ' AND template_id = ?';
                params.push(templateId);
            }
            if (startDate) {
                query += ' AND timestamp >= ?';
                params.push(startDate);
            }
            if (endDate) {
                query += ' AND timestamp <= ?';
                params.push(endDate);
            }
            query += ' GROUP BY hour ORDER BY hour ASC';

            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    getMediaPerformanceAnalytics: (startDate = null, endDate = null) => {
        return new Promise((resolve, reject) => {
            let query = `
SELECT
m.media_type,
    COUNT(ta.id) as total_sent,
    SUM(CASE WHEN ta.status IN('delivered', 'read') THEN 1 ELSE 0 END) as delivered,
    SUM(CASE WHEN ta.status = 'read' THEN 1 ELSE 0 END) as read,
    SUM(ta.responded) as responses
                FROM template_analytics ta
                JOIN messages m ON ta.message_id = m.id
                WHERE 1 = 1
    `;
            const params = [];
            if (startDate) {
                query += ' AND ta.timestamp >= ?';
                params.push(startDate);
            }
            if (endDate) {
                query += ' AND ta.timestamp <= ?';
                params.push(endDate);
            }
            query += ' GROUP BY m.media_type';

            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else {
                    const formatted = rows.map(r => ({
                        media_type: r.media_type || 'text',
                        total_sent: r.total_sent,
                        delivered: r.delivered,
                        read: r.read,
                        responses: r.responses
                    }));
                    resolve(formatted);
                }
            });
        });
    },

    getAudiencePerformanceAnalytics: (startDate = null, endDate = null) => {
        return new Promise((resolve, reject) => {
            let query = `
SELECT
c.tags,
    COUNT(ta.id) as total_sent,
    SUM(CASE WHEN ta.status IN('delivered', 'read') THEN 1 ELSE 0 END) as delivered,
    SUM(CASE WHEN ta.status = 'read' THEN 1 ELSE 0 END) as read,
    SUM(ta.responded) as responses
                FROM template_analytics ta
                JOIN messages m ON ta.message_id = m.id
                JOIN customers c ON m.number = c.number
                WHERE 1 = 1
    `;
            const params = [];
            if (startDate) {
                query += ' AND ta.timestamp >= ?';
                params.push(startDate);
            }
            if (endDate) {
                query += ' AND ta.timestamp <= ?';
                params.push(endDate);
            }
            query += ' GROUP BY c.tags';

            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else {
                    // We need to split tags since they are stored as JSON strings like '["VIP", "Lead"]'
                    const tagMap = {};
                    rows.forEach(row => {
                        let tags = [];
                        try { tags = JSON.parse(row.tags || '[]'); } catch (e) { }
                        if (!Array.isArray(tags)) tags = [];

                        if (tags.length === 0) tags = ['Untagged'];

                        tags.forEach(tag => {
                            if (!tagMap[tag]) {
                                tagMap[tag] = { tag, total_sent: 0, delivered: 0, read: 0, responses: 0 };
                            }
                            tagMap[tag].total_sent += row.total_sent;
                            tagMap[tag].delivered += row.delivered;
                            tagMap[tag].read += row.read;
                            tagMap[tag].responses += row.responses;
                        });
                    });
                    resolve(Object.values(tagMap));
                }
            });
        });
    },
    incrementTemplateUsage: (id) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('UPDATE templates SET usage_count = usage_count + 1 WHERE id = ?');
            stmt.run(id, function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
            stmt.finalize();
        });
    },
    toggleTemplatePin: (id, pinStatus) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('UPDATE templates SET is_pinned = ? WHERE id = ?');
            // Ensure pinStatus is a number (1 or 0)
            stmt.run(pinStatus ? 1 : 0, id, function (err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            });
            stmt.finalize();
        });
    },

    /* Bot Rules functions removed */

    // Statistics
    getContactStats: () => {
        return new Promise((resolve, reject) => {
            db.get(`
SELECT
    (SELECT COUNT(*) FROM customers) as totalContacts,
    (SELECT COUNT(*) FROM groups) as totalGroups,
        (SELECT COUNT(*) FROM messages WHERE type = 'sent') as sentCount,
            (SELECT COUNT(*) FROM messages WHERE type = 'received') as receivedCount
                `, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },
    getContactHistory: (contactId) => {
        return new Promise((resolve, reject) => {
            // Get contact with groups
            db.get(`
                SELECT c.*, GROUP_CONCAT(g.name) as groupNames, GROUP_CONCAT(g.id) as groupIds
                FROM customers c
                LEFT JOIN contact_groups cg ON c.id = cg.contact_id
                LEFT JOIN groups g ON cg.group_id = g.id
                WHERE c.id = ?
    GROUP BY c.id
        `, [contactId], (err, customer) => {
                if (err || !customer) return reject(err || new Error('Customer not found'));

                // Get messages
                db.all('SELECT * FROM messages WHERE number = ? ORDER BY id DESC LIMIT 100', [customer.number], (err, rows) => {
                    if (err) reject(err);
                    else resolve({
                        contact: customer,
                        history: rows
                    });
                });
            });
        });
    },
    getContactHistoryByPhone: (number) => {
        return new Promise((resolve, reject) => {
            // Get contact with groups
            db.get(`
                SELECT c.*, GROUP_CONCAT(g.name) as groupNames, GROUP_CONCAT(g.id) as groupIds
                FROM customers c
                LEFT JOIN contact_groups cg ON c.id = cg.contact_id
                LEFT JOIN groups g ON cg.group_id = g.id
                WHERE c.number = ?
    GROUP BY c.id
        `, [number], (err, customer) => {
                // If customer not found, we still want the history but with basic contact info
                if (err) return reject(err);

                const finalContact = customer || { number, name: 'Anonymous', tags: '[]' };

                // Get messages
                db.all('SELECT * FROM messages WHERE number = ? ORDER BY id DESC LIMIT 100', [number], (err, rows) => {
                    if (err) reject(err);
                    else resolve({
                        contact: finalContact,
                        history: rows
                    });
                });
            });
        });
    },
    getDuplicates: () => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT number, COUNT(*) as count, GROUP_CONCAT(id) as ids, GROUP_CONCAT(name) as names
                FROM customers
                GROUP BY number
                HAVING count > 1
    `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    mergeContacts: (primaryId, duplicateIds) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                const placeholders = duplicateIds.map(() => '?').join(',');
                db.run(`DELETE FROM contact_groups WHERE contact_id IN(${placeholders})`, duplicateIds);
                db.run(`DELETE FROM customers WHERE id IN(${placeholders})`, duplicateIds, (err) => {
                    if (err) reject(err);
                    else resolve({ success: true });
                });
            });
        });
    },

    // Analytics
    addTemplateAnalytic: (templateId, messageId, whatsappId) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('INSERT INTO template_analytics (template_id, message_id, whatsapp_id) VALUES (?, ?, ?)');
            stmt.run(templateId, messageId, whatsappId, function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
            stmt.finalize();
        });
    },
    updateTemplateAnalyticStatus: (whatsappId, status) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('UPDATE template_analytics SET status = ? WHERE whatsapp_id = ?');
            stmt.run(status, whatsappId, function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
            stmt.finalize();
        });
    },
    recordTemplateResponse: (number) => {
        return new Promise((resolve, reject) => {
            // Find the last template sent to this number within the last 24 hours that hasn't been responded to
            db.run(`
                UPDATE template_analytics 
                SET responded = 1 
                WHERE whatsapp_id IN(
        SELECT ta.whatsapp_id 
                    FROM template_analytics ta
                    JOIN messages m ON ta.message_id = m.id
                    WHERE m.number = ? AND ta.responded = 0 AND ta.timestamp > datetime('now', '-1 day')
                    ORDER BY ta.timestamp DESC LIMIT 1
    )
    `, [number], function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
        });
    },
    close: () => {
        return new Promise((resolve, reject) => {
            db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },
    getTemplateAnalytics: (templateId = null, startDate = null, endDate = null) => {
        return new Promise((resolve, reject) => {
            let query = `
SELECT
t.id, t.title, t.category,
    COUNT(ta.id) as total_sent,
    SUM(CASE WHEN ta.status IN('delivered', 'read') THEN 1 ELSE 0 END) as delivered,
    SUM(CASE WHEN ta.status = 'read' THEN 1 ELSE 0 END) as read,
    SUM(ta.responded) as responses
                FROM templates t
                LEFT JOIN template_analytics ta ON t.id = ta.template_id
    `;
            const params = [];
            const conditions = [];

            if (templateId) {
                conditions.push('t.id = ?');
                params.push(templateId);
            }

            if (startDate) {
                conditions.push('ta.timestamp >= ?');
                params.push(startDate);
            }

            if (endDate) {
                conditions.push('ta.timestamp <= ?');
                params.push(endDate);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' GROUP BY t.id';

            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    getTemplateInteractionDetails: (templateId) => {
        return new Promise((resolve, reject) => {
            const query = `
SELECT
ta.whatsapp_id, ta.status, ta.responded, ta.timestamp,
    m.number, c.name as contact_name
                FROM template_analytics ta
                JOIN messages m ON ta.message_id = m.id
                LEFT JOIN customers c ON m.number = c.number
                WHERE ta.template_id = ?
    ORDER BY ta.timestamp DESC
            `;
            db.all(query, [templateId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    // Messages - Single record lookup and hard delete
    getMessageById: (id) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM messages WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            });
        });
    },
    deleteMessage: (id) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM messages WHERE id = ?', [id], function (err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            });
        });
    },

    /**
     * getDeleteCandidates — Smart Bulk Delete query
     * @param {number[]} templateIds    — which campaigns to look in
     * @param {string}   statusFilter   — 'not_read' | 'not_delivered' | 'not_replied' | 'all'
     * @param {string[]} numberFilter   — optional specific phone numbers (empty = all)
     */
    getDeleteCandidates: (templateIds, statusFilter, numberFilter = []) => {
        return new Promise((resolve, reject) => {
            if (!templateIds || templateIds.length === 0) {
                return resolve([]);
            }

            const tPlaceholders = templateIds.map(() => '?').join(',');
            const params = [...templateIds];

            let statusCondition = '';
            if (statusFilter === 'not_read') {
                statusCondition = "AND ta.status != 'read'";
            } else if (statusFilter === 'not_delivered') {
                statusCondition = "AND ta.status = 'sent'";
            } else if (statusFilter === 'not_replied') {
                statusCondition = 'AND ta.responded = 0';
            }
            // 'all' = no extra condition

            let numberCondition = '';
            if (numberFilter && numberFilter.length > 0) {
                const nPlaceholders = numberFilter.map(() => '?').join(',');
                numberCondition = `AND m.number IN(${nPlaceholders})`;
                params.push(...numberFilter);
            }

            const query = `
SELECT
ta.whatsapp_id,
    ta.status,
    ta.responded,
    m.number,
    m.text as message_preview,
    m.id as message_id,
    c.name as contact_name,
    t.title as template_title
                FROM template_analytics ta
                JOIN messages m ON ta.message_id = m.id
                LEFT JOIN customers c ON m.number = c.number
                JOIN templates t ON ta.template_id = t.id
                WHERE ta.template_id IN(${tPlaceholders})
                  AND ta.whatsapp_id IS NOT NULL
                  ${statusCondition}
                  ${numberCondition}
                ORDER BY ta.timestamp DESC
    `;

            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    /**
     * getTemplateSendGroups — Returns recipients grouped by template + send date
     * Used to power the "Campaign Date Chooser" popup in Smart Bulk Delete
     * @param {number[]} templateIds
     * @returns {Promise<GroupedSendData>}
     */
    getTemplateSendGroups: (templateIds) => {
        return new Promise((resolve, reject) => {
            if (!templateIds || templateIds.length === 0) return resolve([]);

            const placeholders = templateIds.map(() => '?').join(',');
            const query = `
SELECT
ta.template_id,
    t.title       AS template_title,
        DATE(ta.timestamp) AS send_date,
            ta.timestamp  AS full_timestamp,
                m.number,
                ta.whatsapp_id,
                c.name        AS contact_name
                FROM template_analytics ta
                JOIN messages  m ON ta.message_id = m.id
                JOIN templates t ON ta.template_id = t.id
                LEFT JOIN customers c ON m.number = c.number
                WHERE ta.template_id IN(${placeholders})
                  AND ta.whatsapp_id IS NOT NULL
                ORDER BY ta.timestamp DESC
    `;

            db.all(query, templateIds, (err, rows) => {
                if (err) return reject(err);

                // Group: { templateId -> { templateTitle, dates: { sendDate -> recipients[] } } }
                const grouped = {};
                for (const row of rows) {
                    const tid = row.template_id;
                    if (!grouped[tid]) {
                        grouped[tid] = { templateId: tid, templateTitle: row.template_title, dates: {} };
                    }
                    const sd = row.send_date;
                    if (!grouped[tid].dates[sd]) {
                        grouped[tid].dates[sd] = { sendDate: sd, recipients: [] };
                    }
                    grouped[tid].dates[sd].recipients.push({
                        number: row.number,
                        name: row.contact_name || null,
                        whatsappId: row.whatsapp_id,
                    });
                }

                // Flatten to array-of-arrays format for easy frontend consumption
                const result = Object.values(grouped).map(tpl => ({
                    templateId: tpl.templateId,
                    templateTitle: tpl.templateTitle,
                    sendGroups: Object.values(tpl.dates).sort((a, b) =>
                        new Date(b.sendDate) - new Date(a.sendDate)
                    ),
                }));

                resolve(result);
            });
        });
    },

    // ── Unified Campaigns ───────────────────────────────────────────────────

    /**
     * createScheduledCampaign — Create a new pending scheduled (or instant/ai) campaign
     */
    createScheduledCampaign: ({ name, message, type = 'scheduled', target_type, target_id, target_name, scheduled_at, total_recipients, template_id, delayMin, delayMax, execution_windows, respect_execution_windows = 1 }) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`
                INSERT INTO campaigns(
        name, message, type, target_type, target_id, target_name,
        scheduled_at, total_recipients, template_id, delayMin, delayMax, execution_windows, respect_execution_windows, created_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            `);
            stmt.run(
                name, message, type, target_type, String(target_id), target_name || null,
                scheduled_at, total_recipients || 0, template_id || null,
                delayMin || null, delayMax || null,
                JSON.stringify(execution_windows || []),
                respect_execution_windows,
                function (err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
            stmt.finalize();
        });
    },

    /**
     * getAllCampaigns — Get all campaigns for the unified tracker
     */
    getAllCampaigns: () => {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT c.*, t.title as template_title 
                 FROM campaigns c
                 LEFT JOIN templates t ON c.template_id = t.id
                 ORDER BY c.created_at DESC`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    },

    /**
     * getScheduledCampaignById — Get a single campaign by ID
     */
    getScheduledCampaignById: (id) => {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT c.*, t.title as template_title, t.media_path as template_media_path, t.media_type as template_media_type
                 FROM campaigns c
                 LEFT JOIN templates t ON c.template_id = t.id
                 WHERE c.id = ? `,
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    },


    /**
     * getScheduledCampaigns — Get all non-completed scheduled campaigns (for UI queue)
     * Note: Keeping the naming for backward compatibility of UI Queue
     */
    getScheduledCampaigns: (showAll = false) => {
        return new Promise((resolve, reject) => {
            const whereClause = showAll ? "WHERE 1=1" : "WHERE sc.type = 'scheduled' AND sc.status NOT IN ('completed', 'cancelled', 'failed')";
            db.all(
                `SELECT sc.*, t.title as template_title 
                 FROM campaigns sc
                 LEFT JOIN templates t ON sc.template_id = t.id
                 ${whereClause}
                 ORDER BY sc.id DESC`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    },

    /**
     * getDueCampaigns — Get all 'pending' campaigns whose time has come
     */
    getDueCampaigns: () => {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT sc.*, t.media_path as template_media_path, t.media_type as template_media_type
                 FROM campaigns sc
                 LEFT JOIN templates t ON sc.template_id = t.id
                 WHERE sc.status = 'pending' AND sc.type = 'scheduled'
                   AND sc.scheduled_at <= ?
    ORDER BY sc.scheduled_at ASC`,
                [new Date().toISOString()],
                (err, rows) => {
                    if (err) return reject(err);

                    // Parse attachments from template_media_path if it's JSON
                    const parsedRows = rows.map(row => {
                        let attachments = [];
                        let finalMediaPath = row.template_media_path;
                        let finalMediaType = row.template_media_type;

                        if (row.template_media_path) {
                            try {
                                const parsed = JSON.parse(row.template_media_path);
                                if (Array.isArray(parsed)) {
                                    attachments = parsed;
                                    if (parsed.length > 0) {
                                        finalMediaPath = parsed[0].url;
                                        finalMediaType = parsed[0].type;
                                    }
                                } else {
                                    attachments = [{ url: row.template_media_path, type: row.template_media_type }];
                                }
                            } catch (e) {
                                attachments = [{ url: row.template_media_path, type: row.template_media_type }];
                            }
                        }

                        return {
                            ...row,
                            media_path: finalMediaPath,
                            media_type: finalMediaType,
                            attachments: attachments
                        };
                    });
                    resolve(parsedRows);
                }
            );
        });
    },

    /**
     * updateScheduledCampaignStatus — Update status, sent_count, fail_count
     */
    updateScheduledCampaignStatus: (id, status, sentCount = 0, failCount = 0, totalRecipients = null) => {
        require('fs').appendFileSync('db_args.log', JSON.stringify({ fn: 'updateScheduledCampaignStatus', id, status, sentCount, failCount, totalRecipients }) + '\n');
        return new Promise((resolve, reject) => {
            let query = `UPDATE campaigns SET status = ?, sent_count = ?, fail_count = ? `;
            const params = [status, sentCount, failCount];
            if (totalRecipients !== null) {
                query += `, total_recipients = ? `;
                params.push(totalRecipients);
            }
            query += ` WHERE id = ? `;
            params.push(id);

            const stmt = db.prepare(query);
            stmt.run(...params, function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
            stmt.finalize();
        });
    },

    /**
     * incrementCampaignFailCount — Atomic Thread-Safe Incrementor
     */
    incrementCampaignFailCount: (id, incrementAmount) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`UPDATE campaigns SET fail_count = fail_count + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? `);
            stmt.run(Math.max(0, incrementAmount), id, function (err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            });
            stmt.finalize();
        });
    },

    /**
     * toggleScheduledCampaignPause — Pause/Resume a campaign
     */
    toggleScheduledCampaignPause: (id, shouldPause) => {
        return new Promise((resolve, reject) => {
            const status = shouldPause ? 'paused' : 'pending';
            const pausedAt = shouldPause ? `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` : 'NULL';
            const stmt = db.prepare(
                `UPDATE campaigns SET status = ?, paused_at = ${pausedAt} WHERE id = ? AND status IN('pending', 'paused')`
            );
            stmt.run(status, id, function (err) {
                if (err) reject(err);
                else resolve({ success: this.changes > 0 });
            });
            stmt.finalize();
        });
    },

    cancelScheduledCampaign: (id) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(
                `UPDATE campaigns SET status = 'cancelled' WHERE id = ? AND status IN('pending', 'running', 'paused')`
            );
            stmt.run(id, function (err) {
                if (err) reject(err);
                else resolve({ success: this.changes > 0 });
            });
            stmt.finalize();
        });
    },

    /**
     * deleteScheduledCampaign — Hard delete (only cancelled/completed)
     */
    deleteScheduledCampaign: (id) => {
        return new Promise((resolve, reject) => {
            // Also delete associated messages
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                db.run(`DELETE FROM messages WHERE campaign_id = ? `, [id]);
                db.run(`DELETE FROM campaigns WHERE id = ? AND status IN('cancelled', 'completed', 'failed')`, [id], function (err) {
                    if (err) {
                        db.run("ROLLBACK");
                        reject(err);
                    } else {
                        db.run("COMMIT");
                        resolve({ success: this.changes > 0 });
                    }
                });
            });
        });
    },
    /**
     * resumeScheduledCampaign — Resume a campaign with optional extension
     */
    resumeScheduledCampaign: (id, additionalMinutes = 0) => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT scheduled_at, paused_at, original_scheduled_at FROM campaigns WHERE id = ? `, [id], (err, row) => {
                if (err) return reject(err);
                if (!row) return resolve({ success: false, error: 'Campaign not found' });

                const now = new Date();
                let newScheduledAt;
                const currentScheduled = new Date(row.scheduled_at);
                const originalScheduledAt = row.original_scheduled_at || row.scheduled_at;

                if (row.paused_at) {
                    const pausedAt = new Date(row.paused_at);
                    const pauseDurationMs = now.getTime() - pausedAt.getTime();
                    newScheduledAt = new Date(currentScheduled.getTime() + pauseDurationMs + (additionalMinutes * 60000));
                } else {
                    newScheduledAt = new Date(Math.max(now.getTime(), currentScheduled.getTime()) + (additionalMinutes * 60000));
                }

                const stmt = db.prepare(
                    `UPDATE campaigns 
                     SET status = 'pending',
    scheduled_at = ?,
    paused_at = NULL,
    is_adjusted = 1,
    original_scheduled_at = ?
        WHERE id = ? `
                );
                stmt.run(newScheduledAt.toISOString(), originalScheduledAt, id, function (err) {
                    if (err) reject(err);
                    else resolve({ success: this.changes > 0, newScheduledAt: newScheduledAt.toISOString() });
                });
                stmt.finalize();
            });
        });
    },
    getCampaignMessages: (campaignId) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT m.*, c.name as contactName 
                FROM messages m
                LEFT JOIN customers c ON m.number = c.number
                WHERE m.campaign_id = ?
    ORDER BY m.id ASC
        `, [campaignId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    /**
     * EXPERIMENTAL: Batch-Optimized Cancel Tracking for Smart Resend
     * Saves hundreds of un-evaluated targets into the messages table
     * as 'cancelled_by_user' so the Resend engine can pick them up later.
     */
    bulkInsertCancelledMessages: (campaignId, targets, templateId = null) => {
        return new Promise((resolve, reject) => {
            if (!targets || targets.length === 0) return resolve({ inserted: 0 });

            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                const stmt = db.prepare(`
                    INSERT INTO messages(
            number, type, timestamp, campaign_id, status, text
        ) VALUES(?, 'outbound', CURRENT_TIMESTAMP, ?, 'error', 'Cancelled by User')
                `);

                let count = 0;
                for (const target of targets) {
                    const num = target.phone || target.number || target;
                    if (num) {
                        stmt.run([num, campaignId]);
                        count++;
                    }
                }

                stmt.finalize();
                db.run("COMMIT", (err) => {
                    if (err) {
                        db.run("ROLLBACK");
                        return reject(err);
                    }
                    resolve({ inserted: count });
                });
            });
        });
    },

    /**
     * Prevents duplicate DB entries by clearing out previous failed records
     * off the messages table, and lowering the campaign fail_count 
     * before Smart Resend processes them again.
     */
    clearFailedMessagesAndDecrementCount: (campaignId, decrementAmount) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                db.run(`DELETE FROM messages WHERE campaign_id = ? AND status LIKE 'error%'`, [campaignId], function (err) {
                    if (err) {
                        db.run("ROLLBACK");
                        return reject(err);
                    }
                    db.run(`UPDATE campaigns SET fail_count = MAX(0, fail_count - ?) WHERE id = ? `, [decrementAmount, campaignId], function (err2) {
                        if (err2) {
                            db.run("ROLLBACK");
                            return reject(err2);
                        }
                        db.run("COMMIT", (err3) => {
                            if (err3) {
                                db.run("ROLLBACK");
                                return reject(err3);
                            }
                            resolve({ success: true });
                        });
                    });
                });
            });
        });
    },


    // ── App Settings ──────────────────────────────────────────────────────────
    getSetting: (key) => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT value FROM app_settings WHERE key = ? `, [key], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.value : null);
            });
        });
    },

    setSetting: (key, value) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT OR REPLACE INTO app_settings(key, value) VALUES(?, ?)`, [key, String(value)], function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    },

    getAllSettings: () => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT key, value FROM app_settings`, [], (err, rows) => {
                if (err) reject(err);
                else {
                    const settings = {};
                    rows.forEach(r => { settings[r.key] = r.value; });
                    resolve(settings);
                }
            });
        });
    },

    // ── Active Executions (Persistence) ───────────────────────────────────────
    saveActiveExecution: (data) => {
        const { id, type, current_index, total_count, status, target_data, payload, respect_execution_windows = 1 } = data;
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO active_executions(
            id, type, current_index, total_count, status, target_data, payload, respect_execution_windows, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);
            stmt.run(id, type, current_index, total_count, status, JSON.stringify(target_data), JSON.stringify(payload), respect_execution_windows, function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
            stmt.finalize();
        });
    },

    getActiveExecutions: () => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM active_executions`, (err, rows) => {
                if (err) reject(err);
                else {
                    const parsed = rows.map(r => ({
                        ...r,
                        target_data: JSON.parse(r.target_data),
                        payload: JSON.parse(r.payload)
                    }));
                    resolve(parsed);
                }
            });
        });
    },

    updateActiveExecutionProgress: (id, currentIndex, status = 'running', totalCount = null) => {
        return new Promise((resolve, reject) => {
            let sql = `UPDATE active_executions SET current_index = ?, status = ?, updated_at = CURRENT_TIMESTAMP `;
            let params = [currentIndex, status];

            if (totalCount !== null) {
                sql += `, total_count = ? `;
                params.push(totalCount);
            }

            sql += ` WHERE id = ? `;
            params.push(id);

            db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve({ success: this.changes > 0 });
            });
        });
    },

    removeActiveExecution: (id) => {
        return new Promise((resolve, reject) => {
            db.run(`DELETE FROM active_executions WHERE id = ? `, [id], function (err) {
                if (err) reject(err);
                else resolve({ success: this.changes > 0 });
            });
        });
    },

    // ── Media Assets (SIS) ───────────────────────────────────────────────────
    getAssetByHash: (hash) => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM media_assets WHERE hash = ? `, [hash], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    saveAsset: (asset) => {
        return new Promise((resolve, reject) => {
            const { hash, url, type, filename, is_protected = 0 } = asset;
            db.run(
                `INSERT OR REPLACE INTO media_assets(hash, url, type, filename, is_protected, created_at) VALUES(?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [hash, url, type, filename, is_protected],
                function (err) {
                    if (err) reject(err);
                    else resolve({ success: true });
                }
            );
        });
    },

    markAssetProtected: (url, isProtected) => {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE media_assets SET is_protected = ? WHERE url = ? `,
                [isProtected ? 1 : 0, url],
                function (err) {
                    if (err) reject(err);
                    else resolve({ success: this.changes > 0 });
                }
            );
        });
    },

    getDailySentCount: () => {
        return new Promise((resolve, reject) => {
            // Count messages sent today (local time start)
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayIso = today.toISOString();

            db.get(
                `SELECT COUNT(*) as count FROM messages WHERE type = 'sent' AND timestamp >= ? `,
                [todayIso],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row?.count || 0);
                }
            );
        });
    },

    isDailyLimitReached: async () => {
        const settings = await dbUtils.getAllSettings();
        if (settings.enable_daily_limit === 'false') return { reached: false };

        const limit = parseInt(settings.daily_limit || 600, 10);
        const sentToday = await dbUtils.getDailySentCount();

        return {
            reached: sentToday >= limit,
            sent: sentToday,
            limit: limit
        };
    },

    // ── AI Brain Architecture ──────────────────────────────────────────────────

    // Business Profile (Singleton)
    getBusinessProfile: () => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM business_profiles ORDER BY id DESC LIMIT 1`, (err, row) => {
                if (err) reject(err);
                else resolve(row || {});
            });
        });
    },

    saveBusinessProfile: (data) => {
        const { company_name, about_text, contact_email, contact_phone, address, delivery_charge_inside, delivery_charge_outside, delivery_timeframe, payment_methods, social_links, return_policy, refund_policy, shipping_policy, exchange_policy, operating_hours, main_website_url, ai_auto_reply_enabled, embedding } = data;
        return new Promise((resolve, reject) => {
            // Check if profile exists
            db.get(`SELECT id FROM business_profiles LIMIT 1`, (err, row) => {
                if (err) return reject(err);
                if (row) {
                    const fields = [];
                    const params = [];
                    if (company_name !== undefined) { fields.push('company_name = ?'); params.push(company_name); }
                    if (about_text !== undefined) { fields.push('about_text = ?'); params.push(about_text); }
                    if (contact_email !== undefined) { fields.push('contact_email = ?'); params.push(contact_email); }
                    if (contact_phone !== undefined) { fields.push('contact_phone = ?'); params.push(contact_phone); }
                    if (address !== undefined) { fields.push('address = ?'); params.push(address); }
                    if (delivery_charge_inside !== undefined) { fields.push('delivery_charge_inside = ?'); params.push(delivery_charge_inside); }
                    if (delivery_charge_outside !== undefined) { fields.push('delivery_charge_outside = ?'); params.push(delivery_charge_outside); }
                    if (delivery_timeframe !== undefined) { fields.push('delivery_timeframe = ?'); params.push(delivery_timeframe); }
                    if (payment_methods !== undefined) { fields.push('payment_methods = ?'); params.push(payment_methods); }
                    if (social_links !== undefined) { fields.push('social_links = ?'); params.push(social_links); }
                    if (return_policy !== undefined) { fields.push('return_policy = ?'); params.push(return_policy); }
                    if (refund_policy !== undefined) { fields.push('refund_policy = ?'); params.push(refund_policy); }
                    if (shipping_policy !== undefined) { fields.push('shipping_policy = ?'); params.push(shipping_policy); }
                    if (exchange_policy !== undefined) { fields.push('exchange_policy = ?'); params.push(exchange_policy); }
                    if (operating_hours !== undefined) { fields.push('operating_hours = ?'); params.push(operating_hours); }
                    if (main_website_url !== undefined) { fields.push('main_website_url = ?'); params.push(main_website_url); }
                    if (ai_auto_reply_enabled !== undefined) { fields.push('ai_auto_reply_enabled = ?'); params.push(ai_auto_reply_enabled); }
                    if (embedding !== undefined) { fields.push('embedding = ?'); params.push(embedding); }

                    if (fields.length === 0) return resolve({ success: true, id: row.id });

                    fields.push('updated_at = CURRENT_TIMESTAMP');
                    params.push(row.id);

                    const stmt = db.prepare(`UPDATE business_profiles SET ${fields.join(', ')} WHERE id = ?`);
                    stmt.run(...params, function (err) {
                        if (err) reject(err);
                        else resolve({ success: true, id: row.id });
                    });
                    stmt.finalize();
                } else {
                    const stmt = db.prepare(`
                        INSERT INTO business_profiles(
        company_name, about_text, contact_email, contact_phone, address,
        delivery_charge_inside, delivery_charge_outside, delivery_timeframe,
        payment_methods, social_links, return_policy, refund_policy,
        shipping_policy, exchange_policy, operating_hours,
        main_website_url, ai_auto_reply_enabled, embedding
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);
                    stmt.run(company_name, about_text, contact_email, contact_phone, address, delivery_charge_inside, delivery_charge_outside, delivery_timeframe, payment_methods, social_links, return_policy, refund_policy, shipping_policy, exchange_policy, operating_hours, main_website_url, ai_auto_reply_enabled, embedding, function (err) {
                        if (err) reject(err);
                        else resolve({ success: true, id: this.lastID });
                    });
                    stmt.finalize();
                }
            });
        });
    },

    // AI Products
    getAIProducts: (options = {}) => {
        const { search, url, category_id, limit = 10000, offset = 0 } = options;
        return new Promise((resolve, reject) => {
            let query = `
                SELECT ipc.*, pc.name as category_name, pc.shipping_inside, pc.shipping_outside, pc.special_policy
                FROM intelligent_product_catalog ipc
                LEFT JOIN product_categories pc ON ipc.category_id = pc.id
            `;
            const params = [];
            const conditions = [];

            if (url) {
                conditions.push(`product_url = ?`);
                params.push(url);
            }
            if (search) {
                conditions.push(`(ipc.name LIKE ? OR ipc.description LIKE ?)`);
                params.push(`%${search}%`, `%${search}%`);
            }
            if (category_id) {
                conditions.push(`ipc.category_id = ?`);
                params.push(category_id);
            }

            if (conditions.length > 0) {
                query += ` WHERE ` + conditions.join(' AND ');
            }

            query += ` ORDER BY ipc.updated_at DESC LIMIT ? OFFSET ? `;
            params.push(limit, offset);

            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else {
                    const parsed = rows.map(r => {
                        let variants;
                        try {
                            let raw = r.variants ? (typeof r.variants === 'string' ? JSON.parse(r.variants) : r.variants) : null;
                            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                                variants = raw;
                            } else {
                                variants = Array.isArray(raw) ? { items: raw } : { items: [] };
                            }
                        } catch (e) {
                            variants = { items: [] };
                        }
                        return {
                            ...r,
                            variants
                        };
                    });
                    resolve(parsed);
                }
            });
        });
    },

    getAIProductById: (id) => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT ipc.*, pc.name as category_name
                FROM intelligent_product_catalog ipc
                LEFT JOIN product_categories pc ON ipc.category_id = pc.id
                WHERE ipc.id = ?
            `;
            db.get(query, [id], (err, row) => {
                if (err) reject(err);
                else {
                    if (row) {
                        try {
                            const raw = row.variants ? (typeof row.variants === 'string' ? JSON.parse(row.variants) : row.variants) : null;
                            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                                row.variants = raw;
                            } else {
                                row.variants = Array.isArray(raw) ? { items: raw } : { items: [] };
                            }
                        } catch (e) {
                            row.variants = { items: [] };
                        }
                    }
                    resolve(row);
                }
            });
        });
    },

    countAIProducts: (options = {}) => {
        const { search } = options;
        return new Promise((resolve, reject) => {
            let query = `SELECT COUNT(*) as count FROM intelligent_product_catalog`;
            const params = [];
            if (search) {
                query += ` WHERE name LIKE ? OR description LIKE ? `;
                params.push(`%${search}%`, `%${search}%`);
            }
            db.get(query, params, (err, row) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
            });
        });
    },

    countAIProductsPendingVector: () => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT COUNT(*) as count 
                FROM intelligent_product_catalog 
                WHERE embedding IS NULL OR embedding = 'null' OR embedding = '[]' OR embedding = ''
            `;
            db.get(query, (err, row) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
            });
        });
    },

    addAIProduct: (data) => {
        const { name, sku, price, description, full_description, image_url, product_url, variants, source = 'manual', manual_override = 1, vector_id, embedding, regular_price, sale_price, category_id } = data;
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`
                INSERT INTO intelligent_product_catalog(
        name, sku, price, description, full_description, image_url, product_url, variants, source, manual_override, vector_id, embedding, regular_price, sale_price, technical_attributes, category_id
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const variantsStr = variants ? (typeof variants === 'string' ? variants : JSON.stringify(variants)) : '{}';
            stmt.run(
                name, sku, price, description, full_description, image_url, product_url, variantsStr,
                source, manual_override, vector_id, embedding, regular_price, sale_price,
                data.technical_attributes || data.specifications || "",
                category_id,
                function (err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
            stmt.finalize();
        });
    },

    updateAIProduct: (id, data) => {
        const { name, sku, price, description, full_description, image_url, product_url, variants, manual_override, vector_id, embedding, regular_price, sale_price, category_id, stock_quantity, ai_attributes, ai_summary } = data;
        return new Promise((resolve, reject) => {
            const fields = [];
            const params = [];

            if (name !== undefined) { fields.push('name = ?'); params.push(name); }
            if (sku !== undefined) { fields.push('sku = ?'); params.push(sku); }
            if (price !== undefined) { fields.push('price = ?'); params.push(price); }
            if (description !== undefined) { fields.push('description = ?'); params.push(description); }
            if (full_description !== undefined) { fields.push('full_description = ?'); params.push(full_description); }
            if (image_url !== undefined) { fields.push('image_url = ?'); params.push(image_url); }
            if (product_url !== undefined) { fields.push('product_url = ?'); params.push(product_url); }
            if (category_id !== undefined) { fields.push('category_id = ?'); params.push(category_id); }
            if (manual_override !== undefined) { fields.push('manual_override = ?'); params.push(manual_override); }
            if (vector_id !== undefined) { fields.push('vector_id = ?'); params.push(vector_id); }
            if (embedding !== undefined) { fields.push('embedding = ?'); params.push(embedding); }
            if (regular_price !== undefined) { fields.push('regular_price = ?'); params.push(regular_price); }
            if (sale_price !== undefined) { fields.push('sale_price = ?'); params.push(sale_price); }
            if (ai_attributes !== undefined) { fields.push('ai_attributes = ?'); params.push(typeof ai_attributes === 'string' ? ai_attributes : JSON.stringify(ai_attributes)); }
            if (ai_summary !== undefined) { fields.push('ai_summary = ?'); params.push(ai_summary); }
            
            // Handle Stock Sync: If variants are provided, recalculate stock_quantity automatically
            if (variants !== undefined) {
                fields.push('variants = ?');
                const variantsStr = typeof variants === 'string' ? variants : JSON.stringify(variants);
                params.push(variantsStr);

                try {
                    const parsed = typeof variants === 'string' ? JSON.parse(variants) : variants;
                    const items = parsed?.items || (Array.isArray(parsed) ? parsed : []);
                    const totalFromVariants = items.reduce((sum, v) => sum + (parseFloat(v.stock || v.stock_quantity || v.quantity) || 0), 0);
                    fields.push('stock_quantity = ?');
                    params.push(totalFromVariants);
                } catch (e) {
                    console.error("Stock recalibration error in updateAIProduct:", e);
                    if (stock_quantity !== undefined) { fields.push('stock_quantity = ?'); params.push(stock_quantity); }
                }
            } else if (stock_quantity !== undefined) {
                fields.push('stock_quantity = ?');
                params.push(stock_quantity);
            }
            if (data.technical_attributes !== undefined || data.specifications !== undefined) { fields.push('technical_attributes = ?'); params.push(data.technical_attributes || data.specifications); }

            if (fields.length === 0) return resolve({ success: true });

            fields.push('updated_at = CURRENT_TIMESTAMP');
            params.push(id);

            const stmt = db.prepare(`UPDATE intelligent_product_catalog SET ${fields.join(', ')} WHERE id = ? `);
            stmt.run(...params, function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
            stmt.finalize();
        });
    },

    deleteAIProduct: (id) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM intelligent_product_catalog WHERE id = ? ', [id], function (err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            });
        });
    },

    bulkDeleteAIProducts: (ids) => {
        return new Promise((resolve, reject) => {
            if (!ids || ids.length === 0) return resolve({ success: true, changes: 0 });
            const placeholders = ids.map(() => '?').join(',');
            db.run(`DELETE FROM intelligent_product_catalog WHERE id IN (${placeholders})`, ids, function (err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            });
        });
    },

    bulkDeleteAIProductsByFilter: (filter = {}) => {
        return new Promise((resolve, reject) => {
            const { search } = filter;
            let query = `DELETE FROM intelligent_product_catalog`;
            const params = [];
            if (search) {
                query += ` WHERE name LIKE ? OR description LIKE ? `;
                params.push(`%${search}%`, `%${search}%`);
            }
            db.run(query, params, function (err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            });
        });
    },

    // Knowledge Documents
    getKnowledgeDocuments: (options = {}) => {
        const { onlyUnvectorized = false } = options;
        return new Promise((resolve, reject) => {
            let query = `SELECT * FROM knowledge_documents`;
            if (onlyUnvectorized) {
                query += ` WHERE embedding IS NULL`;
            }
            query += ` ORDER BY created_at DESC`;

            db.all(query, (err, docs) => {
                if (err) return reject(err);
                if (!docs || docs.length === 0) return resolve([]);

                // Fetch all pins
                db.all(`SELECT * FROM knowledge_pins`, (err2, pins) => {
                    if (err2) {
                        console.error("[DB] Error fetching pins:", err2);
                        return resolve(docs.map(d => ({ ...d, pinned_items: [] })));
                    }

                    const docsWithPins = docs.map(doc => {
                        const docPins = pins
                            .filter(p => p.knowledge_id === doc.id)
                            .map(p => ({ id: p.item_id, type: p.item_type }));
                        return {
                            ...doc,
                            pinned_items: docPins
                        };
                    });
                    resolve(docsWithPins);
                });
            });
        });
    },

    updateKnowledgeDocument: (id, data) => {
        return new Promise((resolve, reject) => {
            const fields = [];
            const params = [];

            if (data.title !== undefined) { fields.push('title = ?'); params.push(data.title); }
            if (data.content !== undefined) { fields.push('content = ?'); params.push(data.content); }
            if (data.type !== undefined) { fields.push('type = ?'); params.push(data.type); }
            if (data.embedding !== undefined) { fields.push('embedding = ?'); params.push(data.embedding); }
            if (data.is_pinned !== undefined) { fields.push('is_pinned = ?'); params.push(data.is_pinned); }
            if (data.pinned_item_id !== undefined) { fields.push('pinned_item_id = ?'); params.push(data.pinned_item_id); }
            if (data.expiry_date !== undefined) { fields.push('expiry_date = ?'); params.push(data.expiry_date); }
            if (data.media_url !== undefined) { fields.push('media_url = ?'); params.push(data.media_url); }
            if (data.media_type !== undefined) { fields.push('media_type = ?'); params.push(data.media_type); }
            if (data.action_tag !== undefined) { fields.push('action_tag = ?'); params.push(data.action_tag); }
            if (data.response_style !== undefined) { fields.push('response_style = ?'); params.push(data.response_style); }

            if (fields.length === 0) return resolve({ success: true });
            params.push(id);

            const stmt = db.prepare(`UPDATE knowledge_documents SET ${fields.join(', ')} WHERE id = ? `);
            stmt.run(...params, function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
            stmt.finalize();
        });
    },

    addKnowledgeDocument: (data) => {
        const { title, content, type = 'faq', embedding = null, is_pinned = 0, pinned_item_id = null, response_style = 'conversational', expiry_date = null, media_url = null, media_type = null, action_tag = null } = data;
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`INSERT INTO knowledge_documents(title, content, type, embedding, is_pinned, pinned_item_id, response_style, expiry_date, media_url, media_type, action_tag) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            stmt.run(title, content, type, embedding, is_pinned, pinned_item_id, response_style, expiry_date, media_url, media_type, action_tag, function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
            stmt.finalize();
        });
    },

    incrementKnowledgeUsage: (id) => {
        return new Promise((resolve, reject) => {
            db.run(`
                UPDATE knowledge_documents 
                SET usage_count = usage_count + 1, last_used_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                WHERE id = ?
            `, [id], (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    },

    syncKnowledgePins: (docId, pins) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run('DELETE FROM knowledge_pins WHERE knowledge_id = ?', [docId]);
                const stmt = db.prepare(`INSERT INTO knowledge_pins(knowledge_id, item_id, item_type) VALUES(?, ?, ?)`);
                pins.forEach(p => stmt.run(docId, p.id, p.type));
                stmt.finalize();
                db.run('COMMIT', (err) => {
                    if (err) { db.run('ROLLBACK'); reject(err); }
                    else resolve({ success: true });
                });
            });
        });
    },

    getPinsForProduct: (productId, categoryId) => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT k.*, p.item_type 
                FROM knowledge_documents k
                JOIN knowledge_pins p ON k.id = p.knowledge_id
                WHERE (p.item_type = 'product' AND p.item_id = ?)
                   OR (p.item_type = 'category' AND p.item_id = ?)
            `;
            db.all(query, [productId, categoryId || null], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    // ── Product Categories ───────────────────────────────────────────────────
    getCategories: () => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM product_categories ORDER BY name ASC`, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    addCategory: (data) => {
        const { name, shipping_inside, shipping_outside, special_policy } = data;
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`INSERT INTO product_categories(name, shipping_inside, shipping_outside, special_policy) VALUES(?, ?, ?, ?)`);
            stmt.run(name, shipping_inside, shipping_outside, special_policy, function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
            stmt.finalize();
        });
    },

    updateCategory: (id, data) => {
        return new Promise((resolve, reject) => {
            const fields = [];
            const params = [];
            if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
            if (data.shipping_inside !== undefined) { fields.push('shipping_inside = ?'); params.push(data.shipping_inside); }
            if (data.shipping_outside !== undefined) { fields.push('shipping_outside = ?'); params.push(data.shipping_outside); }
            if (data.special_policy !== undefined) { fields.push('special_policy = ?'); params.push(data.special_policy); }
            
            if (fields.length === 0) return resolve({ success: true });
            params.push(id);
            db.run(`UPDATE product_categories SET ${fields.join(', ')} WHERE id = ?`, params, function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    },

    deleteCategory: (id) => {
        return new Promise((resolve, reject) => {
            // Reassign products to 'General' (id 1 assumed or first found)
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run('UPDATE intelligent_product_catalog SET category_id = NULL WHERE category_id = ?', [id]);
                db.run('DELETE FROM product_categories WHERE id = ?', [id], function (err) {
                    if (err) { db.run('ROLLBACK'); reject(err); }
                    else { db.run('COMMIT'); resolve({ success: true }); }
                });
            });
        });
    },

    deleteKnowledgeDocument: (id) => {
        return new Promise((resolve, reject) => {
            db.run(`DELETE FROM knowledge_documents WHERE id = ? `, [id], function (err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            });
        });
    },

    // Frontier Management (Enterprise Optimization)
    addToFrontier: (processId, url, status = 'pending') => {
        const urlHash = require('crypto').createHash('md5').update(url).digest('hex');
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`INSERT OR REPLACE INTO crawler_frontier(process_id, url_hash, url, status) VALUES(?, ?, ?, ?)`);
            stmt.run(processId, urlHash, url, status, function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
            stmt.finalize();
        });
    },

    checkFrontier: (processId, url) => {
        const urlHash = require('crypto').createHash('md5').update(url).digest('hex');
        return new Promise((resolve, reject) => {
            db.get(`SELECT status FROM crawler_frontier WHERE process_id = ? AND url_hash = ?`, [processId, urlHash], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.status : null);
            });
        });
    },

    clearFrontier: (processId) => {
        return new Promise((resolve, reject) => {
            db.run(`DELETE FROM crawler_frontier WHERE process_id = ?`, [processId], function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
        });
    },

    // ── WhatsApp Account Management ──────────────────────────────────────────
    updateConnectedAccount: (data) => {
        return new Promise((resolve, reject) => {
            const { wid, number, name, platform } = data;
            // Upsert: replace if wid exists (single session logic)
            const stmt = db.prepare(`
                INSERT INTO whatsapp_accounts (wid, number, name, platform, last_active) 
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(wid) DO UPDATE SET 
                    number = excluded.number, 
                    name = excluded.name, 
                    platform = excluded.platform,
                    last_active = CURRENT_TIMESTAMP
            `);
            stmt.run(wid, number, name, platform, function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
            stmt.finalize();
        });
    },

    getConnectedAccount: () => {
        return new Promise((resolve, reject) => {
            // Since it's single session, we just get the most recently active one
            db.get('SELECT * FROM whatsapp_accounts ORDER BY last_active DESC LIMIT 1', (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            });
        });
    },

    clearConnectedAccount: () => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM whatsapp_accounts', function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    },
    // --- AI Brain Command Center Methods ---
    logAIInteraction: (data) => {
        return new Promise((resolve, reject) => {
            const { 
                customer_number, user_query, ai_response, context_used, 
                confidence_score, is_handover, intel, 
                api_config_id, purpose, input_tokens, output_tokens, total_tokens, cost, latency,
                detected_intent, tokens_saved
            } = data;
            const intelStr = intel ? (typeof intel === 'string' ? intel : JSON.stringify(intel)) : null;
            const stmt = db.prepare(`
                INSERT INTO ai_logs (
                    customer_number, user_query, ai_response, context_used, 
                    confidence_score, is_handover, intel,
                    api_config_id, purpose, input_tokens, output_tokens, total_tokens, cost, latency,
                    detected_intent, tokens_saved
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
                customer_number, user_query, ai_response, context_used, 
                confidence_score, is_handover ? 1 : 0, intelStr,
                api_config_id, purpose, input_tokens, output_tokens, total_tokens, cost, latency,
                detected_intent || 'GENERAL', tokens_saved || 0,
                function (err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
            stmt.finalize();
        });
    },
    getAIIntentAnalytics: () => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    detected_intent, 
                    COUNT(*) as count, 
                    SUM(tokens_saved) as total_tokens_saved,
                    AVG(total_tokens) as avg_tokens
                FROM ai_logs 
                WHERE detected_intent IS NOT NULL 
                GROUP BY detected_intent 
                ORDER BY count DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    },

    getAILogs: (limit = 50, offset = 0) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT l.*, c.name as api_name, c.model as api_model
                FROM ai_logs l
                LEFT JOIN ai_api_configs c ON l.api_config_id = c.id
                ORDER BY l.timestamp DESC 
                LIMIT ? OFFSET ?
            `, [limit, offset], (err, rows) => {
                if (err) reject(err);
                else {
                    db.get('SELECT COUNT(*) as total FROM ai_logs', (countErr, row) => {
                        resolve({ logs: rows, total: row?.total || 0 });
                    });
                }
            });
        });
    },

    // --- New AI API Management Methods ---
    getAIConfigs: () => {
        return new Promise((resolve, reject) => {
            db.all("SELECT * FROM ai_api_configs ORDER BY is_primary DESC, id ASC", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    getAIConfigLogs: (configId, limit = 50, offset = 0) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT l.*, c.name as api_name 
                FROM ai_logs l
                JOIN ai_api_configs c ON l.api_config_id = c.id
                WHERE l.api_config_id = ?
                ORDER BY l.timestamp DESC
                LIMIT ? OFFSET ?
            `, [configId, limit, offset], (err, rows) => {
                if (err) reject(err);
                else {
                    db.get('SELECT COUNT(*) as total FROM ai_logs WHERE api_config_id = ?', [configId], (countErr, row) => {
                        resolve({ logs: rows, total: row?.total || 0 });
                    });
                }
            });
        });
    },

    addAIConfig: (data) => {
        return new Promise((resolve, reject) => {
            const { name, provider, api_key, model, is_primary } = data;
            db.run(`
                INSERT INTO ai_api_configs (name, provider, api_key, model, is_primary)
                VALUES (?, ?, ?, ?, ?)
            `, [name, provider || 'google', api_key, model || 'gemini-2.5-flash-lite', is_primary ? 1 : 0], function(err) {
                if (err) reject(err);
                else {
                    if (is_primary) {
                        // Set others to not primary
                        db.run("UPDATE ai_api_configs SET is_primary = 0 WHERE id != ?", [this.lastID]);
                    }
                    resolve({ id: this.lastID });
                }
            });
        });
    },

    updateAIConfig: (id, data) => {
        return new Promise((resolve, reject) => {
            const fields = [];
            const params = [];
            Object.entries(data).forEach(([key, val]) => {
                if (['name', 'provider', 'api_key', 'model', 'status', 'is_primary', 'usage_count'].includes(key)) {
                    fields.push(`${key} = ?`);
                    params.push(key === 'is_primary' ? (val ? 1 : 0) : val);
                }
            });
            params.push(id);
            db.run(`UPDATE ai_api_configs SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params, function(err) {
                if (err) reject(err);
                else {
                    if (data.is_primary) {
                        db.run("UPDATE ai_api_configs SET is_primary = 0 WHERE id != ?", [id]);
                    }
                    resolve({ success: true });
                }
            });
        });
    },

    deleteAIConfig: (id) => {
        return new Promise((resolve, reject) => {
            db.run("DELETE FROM ai_api_configs WHERE id = ?", [id], function(err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    },

    getActiveAIConfigs: () => {
        return new Promise((resolve, reject) => {
            db.all("SELECT * FROM ai_api_configs WHERE status = 'active' ORDER BY is_primary DESC, id ASC", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    setAIConfigStatus: (id, status, error = null) => {
        return new Promise((resolve, reject) => {
            db.run("UPDATE ai_api_configs SET status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [status, error, id], function(err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    },

    getAIUsageStats: (days = 7) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    date(timestamp) as date,
                    SUM(total_tokens) as total_tokens,
                    SUM(cost) as total_cost,
                    COUNT(*) as request_count
                FROM ai_logs
                WHERE timestamp > date('now', ?)
                GROUP BY date(timestamp)
                ORDER BY date ASC
            `, [`-${days} days`], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    getAIConfigStats: () => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    c.id, c.name, c.model, c.status,
                    COUNT(l.id) as total_requests,
                    SUM(l.total_tokens) as total_tokens,
                    SUM(l.cost) as total_cost
                FROM ai_api_configs c
                LEFT JOIN ai_logs l ON c.id = l.api_config_id
                GROUP BY c.id
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    getAIAnalytics: () => {
        return new Promise((resolve, reject) => {
            const queries = {
                total_replies: "SELECT COUNT(*) as count FROM ai_logs",
                handovers: "SELECT COUNT(*) as count FROM ai_logs WHERE is_handover = 1",
                avg_confidence: "SELECT AVG(confidence_score) as avg FROM ai_logs WHERE confidence_score > 0",
                daily_stats: `
                    SELECT strftime('%Y-%m-%d', timestamp) as day, 
                           COUNT(*) as total,
                           SUM(CASE WHEN is_handover = 1 THEN 1 ELSE 0 END) as handovers
                    FROM ai_logs 
                    WHERE timestamp > datetime('now', '-7 days')
                    GROUP BY day 
                    ORDER BY day ASC
                `,
                top_knowledge: `
                    SELECT id, title, usage_count, type, last_used_at 
                    FROM knowledge_documents 
                    WHERE usage_count > 0 
                    ORDER BY usage_count DESC 
                    LIMIT 5
                `
            };

            const stats = {};
            db.get(queries.total_replies, (err1, r1) => {
                stats.total_replies = r1?.count || 0;
                db.get(queries.handovers, (err2, r2) => {
                    stats.handovers = r2?.count || 0;
                    db.get(queries.avg_confidence, (err3, r3) => {
                        stats.avg_confidence = r3?.avg || 0;
                        db.all(queries.daily_stats, (err4, r4) => {
                            stats.daily_trends = r4 || [];
                            db.all(queries.top_knowledge, (err5, r5) => {
                                stats.top_knowledge = r5 || [];
                                resolve(stats);
                            });
                        });
                    });
                });
            });
        });
    },
    getPersonalizationData: (number) => {
        return new Promise((resolve, reject) => {
            // Fetch customer and their latest order in one go
            db.get(`
                SELECT c.name, c.last_purchase, c.engagement_score, c.tags,
                       o.status as order_status, o.tracking_id, o.scheduled_delivery, o.total_amount
                FROM customers c
                LEFT JOIN orders o ON c.number = o.customer_number
                WHERE c.number = ?
                ORDER BY o.created_at DESC LIMIT 1
            `, [number], (err, row) => {
                if (err) reject(err);
                else {
                    if (!row) return resolve({ name: 'Guest', engagement: 'new', history: null, last_order: null });
                    const tags = JSON.parse(row.tags || '[]');
                    const engagement = row.engagement_score > 50 ? 'VIP' : (row.engagement_score > 10 ? 'Regular' : 'New');
                    resolve({
                        name: row.name || 'Friend',
                        engagement: engagement,
                        history: row.last_purchase,
                        tags: tags,
                        last_order: row.order_status ? {
                            status: row.order_status,
                            tracking: row.tracking_id,
                            delivery: row.scheduled_delivery,
                            amount: row.total_amount
                        } : null
                    });
                }
            });
        });
    },

    // Order Handlers
    addOrder: (data) => {
        return new Promise((resolve, reject) => {
            const { 
                customer_number, 
                status, 
                total_amount, 
                items, 
                delivery_charge,
                discount,
                order_notes,
                shipping_address,
                tracking_id, 
                scheduled_delivery 
            } = data;
            
            // Start a transaction for safe stock deduction
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");

                db.run(`
                    INSERT INTO orders (
                        customer_number, status, total_amount, items, 
                        delivery_charge, discount, order_notes, shipping_address,
                        tracking_id, scheduled_delivery
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    customer_number, status || 'pending', total_amount, JSON.stringify(items || []),
                    delivery_charge || 0, discount || 0, order_notes || null, shipping_address || null,
                    tracking_id, scheduled_delivery
                ], function(err) {
                    if (err) {
                        db.run("ROLLBACK");
                        return reject(err);
                    }
                    
                    const orderId = this.lastID;

                    // SMART HYBRID STOCK DEDUCTION (Deduct on 'pending')
                    if (items && Array.isArray(items)) {
                        let completed = 0;
                        items.forEach(item => {
                            if (item.id) {
                                // 1. Fetch current product data (including variants JSON)
                                db.get("SELECT stock_quantity, variants FROM intelligent_product_catalog WHERE id = ?", [item.id], (err, product) => {
                                    if (err || !product) {
                                        completed++;
                                        if (completed === items.length) { db.run("COMMIT"); resolve({ id: orderId }); }
                                        return;
                                    }

                                    let newGlobalStock = (product.stock_quantity || 0) - (item.qty || 1);
                                    let newVariantsStr = product.variants;

                                    // 2. If a variant is specified, deduct from variant-specific stock
                                    if (item.variant || item.variantName) {
                                        try {
                                            const vName = item.variantName || item.variant;
                                            let variantsObj = typeof product.variants === 'string' ? JSON.parse(product.variants) : product.variants;
                                            
                                            if (variantsObj && variantsObj.items && Array.isArray(variantsObj.items)) {
                                                const vIdx = variantsObj.items.findIndex(v => v.name === vName || v.value === vName);
                                                if (vIdx !== -1) {
                                                    // Initialize stock if it doesn't exist (using parseFloat for precision)
                                                    const currentVStock = parseFloat(variantsObj.items[vIdx].stock) || 0;
                                                    variantsObj.items[vIdx].stock = currentVStock - (item.qty || 1);
                                                    newVariantsStr = JSON.stringify(variantsObj);
                                                }
                                            }
                                        } catch (e) { console.error("[DB] Variant deduction error:", e); }
                                    }

                                    // 3. Update the database
                                    db.run(
                                        "UPDATE intelligent_product_catalog SET stock_quantity = ?, variants = ? WHERE id = ?",
                                        [newGlobalStock, newVariantsStr, item.id],
                                        () => {
                                            completed++;
                                            if (completed === items.length) {
                                                db.run("COMMIT");
                                                resolve({ id: orderId });
                                            }
                                        }
                                    );
                                });
                            } else {
                                completed++;
                                if (completed === items.length) {
                                    db.run("COMMIT");
                                    resolve({ id: orderId });
                                }
                            }
                        });
                    } else {
                        db.run("COMMIT");
                        resolve({ id: orderId });
                    }
                });
            });
        });
    },

    // Internal helper for production-grade stock adjustments
    _adjustStockInternal: (items, type = 'deduct') => {
        const factor = type === 'deduct' ? -1 : 1;
        return Promise.all(items.map(item => {
            // Logic: Deduct if new order item, return if cancelled/deleted. 
            // Skip items that were merged (unless we are returning stock for the WHOLE order)
            if (!item.id) return Promise.resolve();
            
            return new Promise((res) => {
                db.get("SELECT name, stock_quantity, variants FROM intelligent_product_catalog WHERE id = ?", [item.id], (err, product) => {
                    if (err || !product) {
                        console.error(`[STOCK ENGINE] Product Not Found: ${item.id}`, err);
                        return res();
                    }

                    let newGlobal = (parseFloat(product.stock_quantity) || 0) + ((item.qty || 1) * factor);
                    let newVariants = product.variants;
                    
                    if ((item.variant || item.variantName) && product.variants) {
                        try {
                            const vName = (item.variantName || item.variant).toString().trim();
                            let vObj = JSON.parse(product.variants);
                            let vItems = Array.isArray(vObj) ? vObj : (vObj.items || []);
                            
                            let matchFound = false;
                            vItems = vItems.map((v, i) => {
                                const dbVName = (v.name || (v.type && v.value ? `${v.type}: ${v.value}` : (v.value || v.type || v.sku || `Variant ${i + 1}`))).toString().trim();
                                if (dbVName === vName) {
                                    v.stock = (parseFloat(v.stock) || 0) + ((item.qty || 1) * factor);
                                    matchFound = true;
                                }
                                return v;
                            });

                            if (matchFound) {
                                if (Array.isArray(vObj)) vObj = vItems; else vObj.items = vItems;
                                newVariants = JSON.stringify(vObj);
                                newGlobal = vItems.reduce((sum, v) => sum + (parseFloat(v.stock) || 0), 0);
                            } else {
                                console.warn(`[STOCK ENGINE] No Variant Match: "${vName}" for ${product.name}`);
                            }
                        } catch (e) { console.error("[STOCK ENGINE] Variant processing error", e); }
                    }

                    db.run("UPDATE intelligent_product_catalog SET stock_quantity = ?, variants = ? WHERE id = ?", [newGlobal, newVariants, item.id], () => res());
                });
            });
        }));
    },

    updateOrderStatus: (id, status, tracking_id = null) => enqueue(() => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                db.get("SELECT status, items, customer_number, total_amount, amount_paid FROM orders WHERE id = ?", [id], async (err, order) => {
                    if (err || !order) { db.run("ROLLBACK"); return reject(err || new Error("Order not found")); }
                    const oldStatus = order.status;
                    const items = JSON.parse(order.items || '[]');
                    const isNowInactive = ['cancelled', 'returned'].includes(status);
                    const wasActive = !['cancelled', 'returned', 'merged'].includes(oldStatus);
                    
                    try {
                        if (isNowInactive && wasActive) {
                            await _adjustStockInternal(items, 'return');
                        }
                        
                        const fields = ['status = ?'];
                        const params = [status];
                        if (tracking_id) { fields.push('tracking_id = ?'); params.push(tracking_id); }
                        params.push(id);

                        // [LTV SYNC] Update LTV only on delivery
                        if (status === 'delivered' && oldStatus !== 'delivered') {
                            const amount = parseFloat(order.total_amount?.toString().replace(/[^0-9.]/g, '')) || 0;
                            db.run("UPDATE customers SET lifetime_value = lifetime_value + ? WHERE number = ?", [amount, order.customer_number]);
                        } else if (oldStatus === 'delivered' && isNowInactive) {
                            const amount = parseFloat(order.total_amount?.toString().replace(/[^0-9.]/g, '')) || 0;
                            db.run("UPDATE customers SET lifetime_value = lifetime_value - ? WHERE number = ?", [amount, order.customer_number]);
                        }

                        db.run(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`, params, function(uErr) {
                            if (uErr) { db.run("ROLLBACK"); return reject(uErr); }
                            db.run("COMMIT");
                            const socketIo = global.io;
                            if (socketIo) socketIo.emit('intelligent_products_changed');
                            resolve({ success: true, changes: this.changes });
                        });
                    } catch (e) {
                        db.run("ROLLBACK");
                        reject(e);
                    }
                });
            });
        });
    }),

    verifyOrder: (id, status) => {
        return new Promise((resolve, reject) => {
            db.run('UPDATE orders SET human_verified = ? WHERE id = ?', [status ? 1 : 0, id], function (err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            });
        });
    },

    updateOrderManifest: (id, newItems, totalAmount, deliveryCharge = 0, discount = 0) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                db.get("SELECT items FROM orders WHERE id = ?", [id], async (err, order) => {
                    if (err || !order) { db.run("ROLLBACK"); return reject(err || new Error("Order not found")); }
                    const currentItems = JSON.parse(order.items || '[]');
                    try {
                        await _adjustStockInternal(currentItems, 'return');
                        await _adjustStockInternal(newItems, 'deduct');
                        db.run(`UPDATE orders SET items = ?, total_amount = ?, delivery_charge = ?, discount = ? WHERE id = ?`,
                            [JSON.stringify(newItems), totalAmount, deliveryCharge, discount, id], function(uErr) {
                            if (uErr) { db.run("ROLLBACK"); return reject(uErr); }
                            db.run("COMMIT");
                            const socketIo = global.io;
                            if (socketIo) socketIo.emit('intelligent_products_changed');
                            resolve({ success: true });
                        });
                    } catch (e) { db.run("ROLLBACK"); reject(e); }
                });
            });
        });
    },

    getCustomerByNumber: (number) => new Promise((resolve, reject) => {
        db.get('SELECT * FROM customers WHERE number = ?', [number], (err, row) => {
            if (err) reject(err); else resolve(row);
        });
    }),

    updateCustomerDue: (number, due) => enqueue(() => {
        return new Promise((resolve, reject) => {
            db.run('UPDATE customers SET previous_due = ? WHERE number = ?', [due, number], function(err) {
                if (err) reject(err); else resolve({ success: true, changes: this.changes });
            });
        });
    }),

    createOrder: (data) => enqueue(() => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                const stmt = db.prepare(`INSERT INTO orders
                    (customer_number, items, total_amount, delivery_charge, discount, order_notes, shipping_address, due_added, amount_paid, payment_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                stmt.run(data.customer_number, data.items, data.total_amount, data.delivery_charge, data.discount, data.order_notes, data.shipping_address, data.due_added, data.amount_paid || 0, data.payment_status || 'pending',
                    async function (err) {
                        if (err) { db.run("ROLLBACK"); return reject(err); }
                        const orderId = this.lastID;
                        const items = JSON.parse(data.items || '[]');
                        try {
                            const freshItems = items.filter(it => !it.mergedFrom);
                            await _adjustStockInternal(freshItems, 'deduct');
                            db.run("COMMIT");
                            const socketIo = global.io;
                            if (socketIo) socketIo.emit('intelligent_products_changed');
                            db.get('SELECT * FROM orders WHERE id = ?', [orderId], (e, row) => {
                                if (e) reject(e); else resolve(row);
                            });
                        } catch (e) { db.run("ROLLBACK"); reject(e); }
                    }
                );
                stmt.finalize();
            });
        });
    }),

    /**
     * AUTO-SUCCESSION ENGINE (Re-mastering)
     * Finds all orphaned 'pending' or 'processing' orders for a customer and 
     * collapses them into a single Master Order (the most recent one).
     */
    consolidatePendingOrders: (customerNumber) => enqueue(async () => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM orders 
                WHERE customer_number = ? 
                AND status IN ('pending', 'processing')
                ORDER BY id DESC
            `;
            db.all(query, [customerNumber], async (err, allOrders) => {
                if (err) return reject(err);
                if (!allOrders || allOrders.length <= 1) return resolve({ success: true, count: 0 });

                // 🌐 GROUPING: By normalized address
                const groups = {};
                allOrders.forEach(o => {
                    const addr = (o.shipping_address || 'UNSPECIFIED').trim().toLowerCase().replace(/\s+/g, ' ');
                    if (!groups[addr]) groups[addr] = [];
                    groups[addr].push(o);
                });

                let totalConsolidated = 0;

                try {
                    // Manual Transaction Management for Async/Await Stability
                    await new Promise((res, rej) => db.run("BEGIN TRANSACTION", (e) => e ? rej(e) : res()));

                    for (const addr in groups) {
                        const orders = groups[addr];
                        if (orders.length <= 1) continue;

                        const master = orders[0];
                        const others = orders.slice(1);
                        totalConsolidated += others.length;

                        console.log(`[RE-MASTERING] Master #${master.id} Address: ${addr}`);

                        let masterItems = [];
                        try {
                            masterItems = JSON.parse(master.items || '[]');
                            if (typeof masterItems === 'string') masterItems = JSON.parse(masterItems);
                            if (!Array.isArray(masterItems)) masterItems = [];
                        } catch (e) { masterItems = []; }

                        let masterDue = parseFloat(master.due_added) || 0;
                        let masterPaid = parseFloat(master.amount_paid) || 0;
                        let masterNotes = master.order_notes || '';

                        for (const old of others) {
                            // 🛡️ RE-BALANCING: Reclaim from intermediate masters
                            if (old.is_debt_transferred === 1 && old.debt_source_order_id && old.debt_source_order_id !== master.id) {
                                const intMasterId = old.debt_source_order_id;
                                const intMaster = await new Promise(res => db.get("SELECT * FROM orders WHERE id = ?", [intMasterId], (e, r) => res(r)));
                                
                                if (intMaster && intMaster.status !== 'merged') {
                                    const oldTotal = parseFloat(old.total_amount?.toString().replace(/[^0-9.]/g, '')) || 0;
                                    const oldPaid = parseFloat(old.amount_paid) || 0;
                                    const oldDue = parseFloat(old.due_added) || 0;
                                    const contributionToDue = oldTotal - oldDue;

                                    const newIntDue = Math.max(0, (parseFloat(intMaster.due_added) || 0) - contributionToDue);
                                    const newIntPaid = Math.max(0, (parseFloat(intMaster.amount_paid) || 0) - oldPaid);
                                    
                                    const intItems = JSON.parse(intMaster.items || '[]');
                                    const intItemsTotal = intItems.reduce((sum, it) => {
                                        const p = parseFloat(it.price?.toString().replace(/[^0-9.]/g, '')) || 0;
                                        return sum + (p * (it.qty || 1));
                                    }, 0);
                                    
                                    const newIntTotal = intItemsTotal + (parseFloat(intMaster.delivery_charge) || 0) - (parseFloat(intMaster.discount) || 0) + newIntDue;
                                    const newIntStatus = newIntPaid >= newIntTotal ? 'paid' : (newIntPaid > 0 ? 'partial' : 'pending');

                                    await new Promise(res => db.run(
                                        "UPDATE orders SET due_added = ?, amount_paid = ?, total_amount = ?, payment_status = ?, order_notes = order_notes || ? WHERE id = ?",
                                        [newIntDue, newIntPaid, `৳${newIntTotal}`, newIntStatus, `\n⚠️ Reclaimed by Master #${master.id}`, intMasterId],
                                        () => res()
                                    ));
                                    console.log(`[RE-BALANCING] Cleaned #${intMasterId}. New Paid: ${newIntPaid}`);
                                }
                            }

                            // Item Merge
                            let oldItems = [];
                            try {
                                oldItems = JSON.parse(old.items || '[]');
                                if (typeof oldItems === 'string') oldItems = JSON.parse(oldItems);
                                if (!Array.isArray(oldItems)) oldItems = [];
                            } catch (e) { oldItems = []; }

                            oldItems = oldItems.map((it, idx) => ({ 
                                ...it, 
                                mergedFrom: it.mergedFrom || old.id,
                                _inst: it._inst || `${it.mergedFrom || old.id}-${idx}`
                            }));

                            const masterSources = new Set(masterItems.map(it => it.mergedFrom).filter(Boolean));
                            const uniqueItems = oldItems.filter(it => !masterSources.has(it.mergedFrom));
                            if (uniqueItems.length > 0) masterItems = [...uniqueItems, ...masterItems];

                            // 💸 FINANCIAL RECONCILIATION 2.0 (Backend Integrity)
                            // We inherit the base debt, but if we've already merged the items of this order,
                            // we must not charge for them again via the debt chain.
                            let transferredDebt = parseFloat(old.due_added) || 0;
                            
                            const itemsWereMerged = masterItems.some(it => it.mergedFrom === old.id);
                            const isDebtAlreadyChained = old.is_debt_transferred === 1 && old.debt_source_order_id && old.debt_source_order_id !== master.id;

                            if (itemsWereMerged && isDebtAlreadyChained) {
                                // Calculate the item value that is being double-counted
                                const doubleCountedValue = oldItems.reduce((sum, it) => {
                                    const p = parseFloat(it.price?.toString().replace(/[^0-9.]/g, '')) || 0;
                                    return sum + (p * (it.qty || 1));
                                }, 0);
                                transferredDebt -= doubleCountedValue;
                                console.log(`[BACKEND RECONCILE] Order #${old.id} items merged. Deducting double-counted ৳${doubleCountedValue} from debt chain.`);
                            }
                            
                            masterDue += transferredDebt;

                            if (parseFloat(old.amount_paid) > 0) {
                                await new Promise(res => db.run(
                                    "INSERT INTO order_payments (order_id, amount, method, notes) VALUES (?, ?, 'transfer', ?)",
                                    [master.id, old.amount_paid, `[LINKED] From Merged Order #${old.id}`],
                                    () => res()
                                ));
                            }

                            await new Promise(res => db.run("UPDATE orders SET status = 'merged', is_debt_transferred = 1, debt_source_order_id = ? WHERE id = ?", [master.id, old.id], () => res()));
                            masterNotes += `\n📦 Merged Predecessor #${old.id} (Address Match).`;
                        }

                        // Update Master
                        const itemsTotal = masterItems.reduce((sum, it) => {
                            const p = parseFloat(it.price?.toString().replace(/[^0-9.]/g, '')) || 0;
                            return sum + (p * (it.qty || 1));
                        }, 0);
                        
                        // 🛡️ FINANCIAL SANITY CHECK: Ensure masterPaid correctly reflects ALL payments in the chain
                        const chainOrderIds = [master.id, ...others.map(o => o.id)];
                        const totalPaymentsInChain = await new Promise(res => {
                            db.get(`SELECT SUM(amount) as total FROM order_payments WHERE order_id IN (${chainOrderIds.join(',')})`, [], (e, r) => res(r?.total || 0));
                        });
                        
                        // Override masterPaid with the actual sum of payments from the ledger
                        masterPaid = parseFloat(totalPaymentsInChain) || 0;

                        const finalTotal = itemsTotal + (parseFloat(master.delivery_charge) || 0) - (parseFloat(master.discount) || 0) + masterDue;
                        const finalStatus = masterPaid >= finalTotal ? 'paid' : (masterPaid > 0 ? 'partial' : 'pending');

                        await new Promise(res => db.run(
                            "UPDATE orders SET items = ?, due_added = ?, total_amount = ?, amount_paid = ?, payment_status = ?, order_notes = ? WHERE id = ?",
                            [JSON.stringify(masterItems), masterDue, `৳${finalTotal}`, masterPaid, finalStatus, masterNotes, master.id],
                            () => res()
                        ));

                        if (global.io) {
                            global.io.emit('order_status_updated', { id: master.id });
                            others.forEach(o => global.io.emit('order_status_updated', { id: o.id }));
                        }
                    }

                    await new Promise((res, rej) => db.run("COMMIT", (e) => e ? rej(e) : res()));
                    resolve({ success: true, consolidated: totalConsolidated });

                } catch (err) {
                    db.run("ROLLBACK");
                    reject(err);
                }
            });
        });
    }),



    getOrders: (customer_number = null) => {
        return new Promise((resolve, reject) => {
            const query = customer_number 
                ? "SELECT o.*, c.name as customer_name, COALESCE(o.shipping_address, c.address) as customer_address FROM orders o LEFT JOIN customers c ON o.customer_number = c.number WHERE o.customer_number = ? ORDER BY o.created_at DESC" 
                : "SELECT o.*, c.name as customer_name, COALESCE(o.shipping_address, c.address) as customer_address FROM orders o LEFT JOIN customers c ON o.customer_number = c.number ORDER BY o.created_at DESC";
            const params = customer_number ? [customer_number] : [];
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    getOrderById: (id) => new Promise((resolve, reject) => {
        const query = `
            SELECT o.*, c.name as customer_name, COALESCE(o.shipping_address, c.address) as customer_address 
            FROM orders o 
            LEFT JOIN customers c ON o.customer_number = c.number 
            WHERE o.id = ?
        `;
        db.get(query, [id], (err, row) => {
            if (err) reject(err); else resolve(row);
        });
    }),

    /**
     * FINANCIAL DNA ENGINE
     * Returns a 360-degree financial snapshot of the customer.
     */
    getCustomerFinancialDNA: (number) => new Promise((resolve, reject) => {
        const cleanNumber = formatNumber(number);
        const query = `
            SELECT 
                COUNT(id) as total_orders,
                SUM(CASE WHEN status = 'delivered' THEN CAST(REPLACE(REPLACE(REPLACE(total_amount, '৳', ''), ',', ''), 'Tk', '') AS FLOAT) ELSE 0 END) as ltv,
                SUM(CASE WHEN status IN ('pending', 'processed', 'shipped', 'delivered') THEN (CAST(REPLACE(REPLACE(REPLACE(total_amount, '৳', ''), ',', ''), 'Tk', '') AS FLOAT) - COALESCE(amount_paid, 0)) ELSE 0 END) as total_due,
                SUM(CASE WHEN status = 'cancelled' OR status = 'returned' THEN 1 ELSE 0 END) as total_returns
            FROM orders 
            WHERE customer_number = ? AND is_debt_transferred = 0
        `;
        db.get(query, [cleanNumber], (err, row) => {
            if (err) return reject(err);
            
            const returnRate = row.total_orders > 0 ? (row.total_returns / row.total_orders) * 100 : 0;
            // Trust Score Logic: Starts at 100, drops by 20 per return, increases by 5 per delivered order (max 100)
            let trustScore = 100 - (row.total_returns * 20) + ( (row.total_orders - row.total_returns) * 5 );
            trustScore = Math.max(0, Math.min(100, trustScore));

            resolve({
                totalOrders: row.total_orders || 0,
                ltv: row.ltv || 0,
                totalDue: Math.max(0, row.total_due || 0),
                returnRate: parseFloat(returnRate.toFixed(2)),
                trustScore: Math.round(trustScore)
            });
        });
    }),

    /**
     * FINANCIAL LEDGER ENGINE
     * Returns a flattened, chronological list of all financial events for a customer.
     */
    getCustomerFinancialLedger: (number) => new Promise((resolve, reject) => {
        const cleanNumber = formatNumber(number);
        
        // 1. Fetch Orders (Billing Events)
        const ordersQuery = `SELECT id, total_amount, created_at, status, shipping_address FROM orders WHERE customer_number = ?`;
        
        // 2. Fetch Payments (Payment Events)
        const paymentsQuery = `
            SELECT p.id, p.amount, p.payment_date as timestamp, p.method, p.notes, p.order_id 
            FROM order_payments p
            JOIN orders o ON p.order_id = o.id
            WHERE o.customer_number = ?
        `;

        // 3. Fetch Debt Transfers (Transfer Events)
        const logsQuery = `
            SELECT l.id, l.order_id, l.action, l.note, l.timestamp 
            FROM order_logs l
            JOIN orders o ON l.order_id = o.id
            WHERE o.customer_number = ? AND l.action IN ('merge', 'restoration')
        `;

        db.all(ordersQuery, [cleanNumber], (err, orders) => {
            if (err) return reject(err);
            db.all(paymentsQuery, [cleanNumber], (pErr, payments) => {
                if (pErr) return reject(pErr);
                db.all(logsQuery, [cleanNumber], (lErr, logs) => {
                    if (lErr) return reject(lErr);
                    
                    console.log(`[DB] Ledger Fetch for ${cleanNumber}: Orders=${orders.length}, Payments=${payments.length}, Logs=${logs.length}`);

                    const events = [];

                    // Add Billing Events
                    orders.forEach(o => {
                        events.push({
                            type: 'BILLING',
                            timestamp: o.created_at,
                            amount: parseFloat(o.total_amount.toString().replace(/[^0-9.]/g, '')) || 0,
                            order_id: o.id,
                            status: o.status,
                            address: o.shipping_address,
                            note: `Order #${o.id} placed`
                        });
                        
                        if (o.status === 'cancelled' || o.status === 'returned') {
                            events.push({
                                type: 'RETURN',
                                timestamp: o.created_at, // Use created_at as fallback or log timestamp if available
                                amount: -(parseFloat(o.total_amount.toString().replace(/[^0-9.]/g, '')) || 0),
                                order_id: o.id,
                                address: o.shipping_address,
                                note: `Order #${o.id} ${o.status}`
                            });
                        }
                    });

                    // Add Payment Events
                    payments.forEach(p => {
                        let sourceOrderId = null;
                        // Intelligent parsing for linked transfers
                        if (p.method === 'transfer' && p.notes) {
                            const match = p.notes.match(/Merged Order #(\d+)/);
                            if (match) sourceOrderId = parseInt(match[1]);
                        }

                        events.push({
                            type: 'PAYMENT',
                            timestamp: p.timestamp,
                            amount: p.amount,
                            order_id: p.order_id,
                            source_order_id: sourceOrderId, // THE ANCHOR for context-aware filtering
                            method: p.method,
                            note: p.notes || `Payment for Order #${p.order_id}`
                        });
                    });

                    // Add Transfer Events
                    logs.forEach(l => {
                        if (l.action === 'merge') {
                            // Extract amount from note if present (e.g., "...: 560 TK")
                            const amountMatch = (l.note || '').match(/:\s*(\d+)/);
                            const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

                            events.push({
                                type: 'TRANSFER',
                                timestamp: l.timestamp,
                                order_id: l.order_id,
                                amount: amount,
                                note: l.note || `Debt transferred from Order #${l.order_id}`
                            });
                        }
                    });

                    // Sort by timestamp descending (newest first)
                    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    console.log(`[DB] Final Ledger Events for ${cleanNumber}: ${events.length}`);
                    resolve(events);
                });
            });
        });
    }),

    incrementCustomerDue: (number, amount) => new Promise((resolve, reject) => {
        db.run('UPDATE customers SET previous_due = previous_due + ? WHERE number = ?', [amount, number], function(err) {
            if (err) reject(err); else resolve({ success: true, changes: this.changes });
        });
    }),

    appendOrderNote: (id, note) => new Promise((resolve, reject) => {
        db.run(`UPDATE orders SET order_notes = COALESCE(order_notes, '') || ? WHERE id = ?`, ["\n" + note, id], function(err) {
            if (err) reject(err); else resolve({ success: true, changes: this.changes });
        });
    }),

    getPreviousUnpaidOrders: (customerNumber, currentOrderId = 9999999) => new Promise((resolve, reject) => {
        const query = `
            SELECT * FROM orders 
            WHERE customer_number = ? 
            AND id < ? 
            AND (is_debt_transferred = 0 OR debt_source_order_id = ?)
            AND status IN ('delivered', 'shipped', 'processing', 'pending')
            AND (
                CAST(REPLACE(REPLACE(REPLACE(total_amount, '৳', ''), ',', ''), 'Tk', '') AS FLOAT) 
                - COALESCE(amount_paid, 0)
            ) > 0.01
            ORDER BY created_at ASC
        `;
        db.all(query, [customerNumber, currentOrderId, currentOrderId], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    }),

    /**
     * ITEM HARVESTER: Fetches all pending/processing orders for item consolidation.
     * Unlike the financial engine, this ignores the is_debt_transferred flag.
     */
    getMergeableCandidates: (customerNumber, currentOrderId = 9999999) => new Promise((resolve, reject) => {
        const query = `
            SELECT * FROM orders 
            WHERE customer_number = ? 
            AND id < ? 
            AND status IN ('pending', 'processing')
            ORDER BY created_at ASC
        `;
        db.all(query, [customerNumber, currentOrderId], (err, rows) => {
            if (err) reject(err); else resolve(rows || []);
        });
    }),

    getTotalSettledByOrder: (masterOrderId) => new Promise((resolve, reject) => {
        const query = `
            SELECT SUM(amount) as total 
            FROM order_payments 
            WHERE notes LIKE ?
        `;
        db.get(query, [`%Settled via Order #${masterOrderId}%`], (err, row) => {
            if (err) reject(err); else resolve(row?.total || 0);
        });
    }),

    getOrdersByNoteContent: (content) => new Promise((resolve, reject) => {
        const query = `SELECT * FROM orders WHERE order_notes LIKE ?`;
        db.all(query, [`%${content}%`], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    }),

    addOrderLog: (orderId, action, fromStatus, toStatus, note) => new Promise((resolve, reject) => {
        const query = `INSERT INTO order_logs (order_id, action, from_status, to_status, note) VALUES (?, ?, ?, ?, ?)`;
        db.run(query, [orderId, action, fromStatus, toStatus, note], (err) => {
            if (err) reject(err); else resolve();
        });
    }),

    getOrderLogs: (orderId) => new Promise((resolve, reject) => {
        const query = `SELECT * FROM order_logs WHERE order_id = ? ORDER BY timestamp DESC`;
        db.all(query, [orderId], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    }),

    markDebtAsTransferred: (orderId, successorId) => new Promise((resolve, reject) => {
        const query = `UPDATE orders SET is_debt_transferred = 1, debt_source_order_id = ? WHERE id = ?`;
        db.run(query, [successorId, orderId], (err) => {
            if (err) reject(err); else resolve();
        });
    }),

    /**
     * RECURSIVE ANCESTRY ENGINE
     * Finds ALL orders that were ultimately merged into a specific Master ID,
     * traversing up the chain (1 -> 2 -> 3).
     */
    getMergedPredecessorsRecursive: (masterOrderId) => new Promise((resolve, reject) => {
        const query = `
            WITH RECURSIVE ancestors(id, status, items, total_amount, created_at, debt_source_order_id) AS (
                -- Base case: Immediate children
                SELECT id, status, items, total_amount, created_at, debt_source_order_id 
                FROM orders WHERE debt_source_order_id = ?
                UNION ALL
                -- Recursive step: Parents of current ancestors
                SELECT o.id, o.status, o.items, o.total_amount, o.created_at, o.debt_source_order_id 
                FROM orders o
                JOIN ancestors a ON o.debt_source_order_id = a.id
            )
            SELECT * FROM ancestors WHERE status = 'merged';
        `;
        db.all(query, [masterOrderId], (err, rows) => {
            if (err) reject(err); else resolve(rows || []);
        });
    }),

    /**
     * SUCCESSIVE MASTER FINDER
     * Recursively follows the debt chain forward to find the LATEST order 
     * that currently holds the debt for the given orderId.
     */
    findActiveSuccessiveMaster: (orderId) => new Promise((resolve, reject) => {
        const checkNext = (id) => {
            db.get("SELECT id, status, is_debt_transferred, debt_source_order_id, total_amount, amount_paid FROM orders WHERE id = ?", [id], (err, row) => {
                if (err) return reject(err);
                if (!row) return resolve(null);
                
                // If this order has transferred its debt and is NOT cancelled, follow the chain
                if (row.is_debt_transferred === 1 && row.debt_source_order_id && row.status !== 'cancelled') {
                    checkNext(row.debt_source_order_id);
                } else {
                    // This is the terminal node of the chain (Active, Delivered, or the end of a broken chain)
                    resolve(row);
                }
            });
        };
        
        // Start checking the successor of the given order
        db.get("SELECT debt_source_order_id FROM orders WHERE id = ?", [orderId], (err, row) => {
            if (err) return reject(err);
            if (row && row.debt_source_order_id) {
                checkNext(row.debt_source_order_id);
            } else {
                resolve(null);
            }
        });
    }),

    /**
     * DETAILED DEBT CHAIN FETCH
     * Traces backward from a given orderId to find all orders that contributed 
     * their debt to it. Includes full payment history for each node.
     */
    getDetailedDebtChain: (orderId) => new Promise((resolve, reject) => {
        const query = `
            WITH RECURSIVE ancestors(id, depth) AS (
                SELECT id, 0 FROM orders WHERE id = ?
                UNION ALL
                SELECT o.id, a.depth + 1
                FROM orders o
                JOIN ancestors a ON o.debt_source_order_id = a.id
            )
            SELECT o.*, a.depth
            FROM orders o
            JOIN ancestors a ON o.id = a.id
            WHERE o.id != ?
            ORDER BY a.depth DESC
        `;
        
        db.all(query, [orderId, orderId], async (err, orders) => {
            if (err) {
                console.error("[DB] Debt Chain SQL Error:", err);
                return reject(err);
            }
            
            try {
                if (!orders || orders.length === 0) return resolve([]);
                
                // Fetch payments for each order in the chain separately to avoid SQL complexity
                const processedOrders = await Promise.all(orders.map(async (order) => {
                    return new Promise((resPay) => {
                        db.all("SELECT * FROM order_payments WHERE order_id = ?", [order.id], (pErr, payments) => {
                            resPay({
                                ...order,
                                payments: pErr ? [] : (payments || [])
                            });
                        });
                    });
                }));
                
                resolve(processedOrders);
            } catch (procErr) {
                console.error("[DB] Debt Chain Processing Error:", procErr);
                reject(procErr);
            }
        });
    }),

    adjustOrderBalance: (orderId, amountToAdjust) => new Promise((resolve, reject) => {
        // amountToAdjust can be negative (to subtract)
        db.get("SELECT total_amount, due_added FROM orders WHERE id = ?", [orderId], (err, row) => {
            if (err || !row) return reject(err || new Error("Order not found"));
            
            const currentTotal = parseFloat(row.total_amount.toString().replace(/[^0-9.]/g, '')) || 0;
            const currentDue = parseFloat(row.due_added) || 0;
            
            const newTotal = Math.max(0, currentTotal + amountToAdjust);
            const newDue = currentDue + amountToAdjust;
            
            const query = `UPDATE orders SET total_amount = ?, due_added = ? WHERE id = ?`;
            db.run(query, [`৳${newTotal}`, newDue, orderId], (uErr) => {
                if (uErr) reject(uErr); else resolve({ newTotal, newDue });
            });
        });
    }),

    appendCustomerNote: (number, note) => new Promise((resolve, reject) => {
        db.run(`UPDATE customers SET funnel_notes = COALESCE(funnel_notes, '') || ? WHERE number = ?`, ["\n" + note, number], (err) => {
            if (err) reject(err); else resolve();
        });
    }),

    addOrderPayment: (orderId, amount, method = 'cash', notes = '') => {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO order_payments (order_id, amount, method, notes) VALUES (?, ?, ?, ?)',
                [orderId, amount, method, notes],
                function (err) {
                    if (err) reject(err); else resolve({ id: this.lastID });
                }
            );
        });
    },

    /**
     * SMART PAYMENT ENGINE (Atomic & Linked)
     * Handles payment on an order, propagates it to the Successive Master if needed,
     * and adjusts customer profile debt if the order is delivered.
     */
    processSmartOrderPayment: (orderId, amount, method, notes) => enqueue(() => {
        return new Promise((resolve, reject) => {
            const amountVal = parseFloat(amount) || 0;
            if (amountVal === 0) return resolve({ success: true, message: "Zero amount, skipped." });

            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                
                db.get("SELECT * FROM orders WHERE id = ?", [orderId], async (err, order) => {
                    if (err || !order) { 
                        db.run("ROLLBACK"); 
                        return reject(err || new Error("Order not found")); 
                    }
                    
                    try {
                        const oldPaid = parseFloat(order.amount_paid || 0);
                        const newPaid = oldPaid + amountVal;
                        const totalAmount = parseFloat((order.total_amount || '0').toString().replace(/[^0-9.]/g, '')) || 0;
                        const newStatus = newPaid >= totalAmount ? 'paid' : (newPaid > 0 ? 'partial' : 'pending');

                        // 1. Record payment on the child order
                        db.run("INSERT INTO order_payments (order_id, amount, method, notes) VALUES (?, ?, ?, ?)",
                            [orderId, amountVal, method, notes || 'Manual Payment Entry']);
                        
                        // 2. Update child order
                        db.run("UPDATE orders SET amount_paid = ?, payment_status = ? WHERE id = ?",
                            [newPaid, newStatus, orderId]);
                        
                        // 3. Log action
                        db.run("INSERT INTO order_logs (order_id, action, from_status, to_status, note) VALUES (?, 'payment', ?, ?, ?)",
                            [orderId, order.status, newStatus, `💰 Payment of ৳${amountVal.toLocaleString()} received via ${method}.`]);

                        // 4. Propagation Logic (Linked Payment)
                        let headId = null;
                        if (order.is_debt_transferred === 1) {
                            const head = await dbUtils.findActiveSuccessiveMaster(orderId);
                            if (head && head.id !== orderId) {
                                headId = head.id;
                                const linkedNote = `[LINKED] Payment from Predecessor Order #${orderId}. ${notes || ''}`;
                                
                                // Record linked payment on Head
                                db.run("INSERT INTO order_payments (order_id, amount, method, notes) VALUES (?, ?, ?, ?)",
                                    [head.id, amountVal, method, linkedNote]);
                                
                                // Update Head's paid amount and status
                                const headOldPaid = parseFloat(head.amount_paid || 0);
                                const headNewPaid = headOldPaid + amountVal;
                                const headTotal = parseFloat((head.total_amount || '0').toString().replace(/[^0-9.]/g, '')) || 0;
                                const headNewStatus = headNewPaid >= headTotal ? 'paid' : (headNewPaid > 0 ? 'partial' : 'pending');
                                
                                db.run("UPDATE orders SET amount_paid = ?, payment_status = ? WHERE id = ?",
                                    [headNewPaid, headNewStatus, head.id]);
                                
                                // Log on Head
                                db.run("INSERT INTO order_logs (order_id, action, from_status, to_status, note) VALUES (?, 'linked_payment', ?, ?, ?)",
                                    [head.id, head.status, headNewStatus, `🔗 Linked payment of ৳${amountVal.toLocaleString()} from Order #${orderId}.`]);
                            }
                        }

                        // 5. Customer Profile Adjustment (if Delivered)
                        if (order.status === 'delivered') {
                            db.run("UPDATE customers SET previous_due = MAX(0, previous_due - ?) WHERE number = ?",
                                [amountVal, order.customer_number]);
                        }

                        db.run("COMMIT", (cErr) => {
                            if (cErr) { db.run("ROLLBACK"); return reject(cErr); }
                            
                            // Socket notifications
                            if (global.io) {
                                global.io.emit('order_payment_updated', { id: orderId, amount_paid: newPaid, status: newStatus });
                                global.io.emit('order_status_updated', { id: orderId });
                                if (headId) {
                                    global.io.emit('order_status_updated', { id: headId });
                                }
                                if (order.status === 'delivered') {
                                    global.io.emit('customer_intel_updated', { number: order.customer_number, action: 'due_sync' });
                                }
                            }
                            
                            resolve({ success: true, newPaid, headId });
                        });

                    } catch (e) {
                        db.run("ROLLBACK");
                        reject(e);
                    }
                });
            });
        });
    }),

    getOrderPayments: (orderId) => {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM order_payments WHERE order_id = ? ORDER BY payment_date ASC',
                [orderId],
                (err, rows) => {
                    if (err) reject(err); else resolve(rows);
                }
            );
        });
    },

    updateOrderPayment: (id, data) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('UPDATE orders SET payment_status = ?, amount_paid = ? WHERE id = ?');
            stmt.run(data.payment_status, data.amount_paid, id, function(err) {
                if (err) reject(err); else resolve({ success: true, changes: this.changes });
            });
            stmt.finalize();
        });
    },

    getIntelligenceStats: () => {
        return new Promise((resolve, reject) => {
            const queries = {
                hot_leads: "SELECT COUNT(*) as count FROM customers WHERE interest_score > 70 OR lifecycle_stage = 'opportunity'",
                churn_risks: "SELECT COUNT(*) as count FROM customers WHERE sentiment_score < 40",
                premium_buyers: "SELECT COUNT(*) as count FROM customers WHERE loyalty_score > 70 AND price_sensitivity_score < 30",
                bargainers: "SELECT COUNT(*) as count FROM customers WHERE price_sensitivity_score > 70",
                info_seekers: "SELECT COUNT(*) as count FROM customers WHERE interest_score > 60 AND (lifetime_value = 0 OR lifetime_value IS NULL)",
                total_intel_tracked: "SELECT COUNT(*) as count FROM customers WHERE interest_score > 0 OR price_sensitivity_score > 0"
            };

            const stats = {};
            const keys = Object.keys(queries);
            let completed = 0;

            keys.forEach(key => {
                db.get(queries[key], (err, row) => {
                    if (err) return reject(err);
                    stats[key] = row?.count || 0;
                    completed++;
                    if (completed === keys.length) resolve(stats);
                });
            });
        });
    },

    // Intent Management Helpers
    getIntents: () => {
        return new Promise((resolve, reject) => {
            db.all("SELECT * FROM intelligent_intents ORDER BY intent_tag ASC", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    addIntent: (data) => {
        return new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO intelligent_intents (intent_tag, media_url, media_type, description)
                VALUES (?, ?, ?, ?)
            `, [data.intent_tag.toUpperCase(), data.media_url, data.media_type || 'image', data.description], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
        });
    },

    deleteIntent: (id) => {
        return new Promise((resolve, reject) => {
            db.run("DELETE FROM intelligent_intents WHERE id = ?", [id], (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    },

    // Outbox Persistence Layer
    addOutgoingQueue: (chatId, text, mediaPayload = null, options = {}, metadata = {}) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`
                INSERT INTO outgoing_queue (chat_id, text, media_payload, options, metadata) 
                VALUES (?, ?, ?, ?, ?)
            `);
            stmt.run(
                chatId, 
                text, 
                mediaPayload ? JSON.stringify(mediaPayload) : null, 
                JSON.stringify(options), 
                JSON.stringify(metadata), 
                function (err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
            stmt.finalize();
        });
    },

    getPendingFromOutbox: (limit = 10) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM outgoing_queue 
                WHERE status = 'pending' AND retry_count < 5
                ORDER BY id ASC LIMIT ?
            `, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    updateOutboxStatus: (id, status, error = null) => {
        return new Promise((resolve, reject) => {
            const query = status === 'failed' 
                ? 'UPDATE outgoing_queue SET status = ?, last_error = ?, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
                : 'UPDATE outgoing_queue SET status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
            
            db.run(query, [status, error, id], function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
        });
    },

    deleteFromOutbox: (id) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM outgoing_queue WHERE id = ?', [id], function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
        });
    },

    resetStaleOutbox: () => {
        return new Promise((resolve, reject) => {
            // Reset 'sending' back to 'pending' so they can be retried after a crash
            db.run(`UPDATE outgoing_queue SET status = 'pending' WHERE status = 'sending'`, function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
        });
    },

    resetStaleAIConfigs: () => {
        return new Promise((resolve, reject) => {
            // Automatically re-enable 'error' or 'limit_exceeded' configs to try again
            // We only do this for statuses that might be temporary
            db.run(`UPDATE ai_api_configs SET status = 'active' WHERE status IN ('limit_exceeded', 'error')`, function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
        });
    },

    cleanupOutbox: (days = 3) => {
        return new Promise((resolve, reject) => {
            // Delete sent messages older than X days
            db.run(`DELETE FROM outgoing_queue WHERE status = 'sent' AND created_at < date('now', '-${days} days')`, function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
        });
    },

    // AI Generation Queue Helpers
    addAIRetryTask: (chatId, userMessage, payload) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`
                INSERT INTO ai_generation_queue (chat_id, user_message, payload) 
                VALUES (?, ?, ?)
            `);
            stmt.run(chatId, userMessage, JSON.stringify(payload), function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
            stmt.finalize();
        });
    },

    getPendingAIRetryTasks: (limit = 5) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM ai_generation_queue 
                WHERE status = 'pending' AND retry_count < 5
                ORDER BY id ASC LIMIT ?
            `, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    updateAIRetryStatus: (id, status, error = null) => {
        return new Promise((resolve, reject) => {
            const query = status === 'failed'
                ? 'UPDATE ai_generation_queue SET status = ?, last_error = ?, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
                : 'UPDATE ai_generation_queue SET status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
            db.run(query, [status, error, id], function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
        });
    },

    deleteAIRetryTask: (id) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM ai_generation_queue WHERE id = ?', [id], function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
        });
    },

    hasRepliedSince: (number, sinceTimestamp) => {
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            // Check if any 'sent' message exists for this number since the reference timestamp
            // sinceTimestamp is expected in ISO format or valid SQLite date format
            db.get(`
                SELECT id FROM messages 
                WHERE number = ? AND type = 'sent' AND timestamp > ?
                LIMIT 1
            `, [cleanNumber, sinceTimestamp], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });
    },

    resetStaleAIRetryTasks: () => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE ai_generation_queue SET status = 'pending' WHERE status = 'processing'`, function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
        });
    },

    // ── Smart Finance & Procurement Logic ──────────────────────────────────────────

    getProcurements: (batchId = null) => {
        return new Promise((resolve, reject) => {
            const filter = batchId ? "WHERE p.batch_id = ?" : "";
            const params = batchId ? [batchId] : [];
            db.all(`
                SELECT p.*, c.name as product_name, c.sku as product_sku 
                FROM stock_procurements p
                JOIN intelligent_product_catalog c ON p.product_id = c.id
                ${filter}
                ORDER BY p.purchase_date DESC
            `, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    getProcurementBatches: () => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    batch_id,
                    supplier,
                    purchase_date as date,
                    SUM(quantity) as total_qty,
                    SUM(quantity * purchase_price) as total_investment,
                    SUM(quantity * landed_cost) as total_landed_investment,
                    COUNT(id) as item_count
                FROM stock_procurements
                GROUP BY batch_id
                ORDER BY date DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    addProcurement: (data) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                // 1. Insert Procurement Record
                const stmt = db.prepare(`
                    INSERT INTO stock_procurements (product_id, variant_name, quantity, purchase_price, supplier, purchase_date)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);
                
                stmt.run(data.product_id, data.variant_name || null, data.quantity, data.purchase_price, data.supplier, data.purchase_date || new Date().toISOString(), function(err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }
                    
                    const procurementId = this.lastID;

                    // 2. Update Product/Variant Stock
                    db.get('SELECT stock_quantity, variants FROM intelligent_product_catalog WHERE id = ?', [data.product_id], (err, product) => {
                        if (err || !product) {
                            db.run('ROLLBACK');
                            return reject(err || new Error('Product not found'));
                        }

                        let updateQuery = '';
                        let params = [];

                        if (data.variant_name && product.variants) {
                            let variantsObj = JSON.parse(product.variants);
                            let items = variantsObj.items || [];
                            let updated = false;
                            
                            items = items.map(v => {
                                const dbVName = String(v.name || v.value || v.type || '').trim().toLowerCase();
                                const inputVName = String(data.variant_name).trim().toLowerCase();
                                const altVName = (String(v.type || '') + ': ' + String(v.value || '')).trim().toLowerCase();

                                if (dbVName === inputVName || altVName === inputVName || String(v.value || '').trim().toLowerCase() === inputVName || String(v.type || '').trim().toLowerCase() === inputVName) {
                                    const oldVStock = parseFloat(v.stock) || 0;
                                    v.stock = oldVStock + parseFloat(data.quantity);
                                    updated = true;
                                    const logMsg = `[Procurement Log] Single Entry - Match Found: "${v.name || v.type || v.value}" (${oldVStock} -> ${v.stock})`;
                                    if (global.io) global.io.emit('procurement_log', logMsg);
                                    console.log(logMsg);
                                }
                                return v;
                            });

                            if (!updated) {
                                const availNames = items.map(v => `(Name: "${v.name}", Type: "${v.type}", Value: "${v.value}")`).join(', ');
                                const logMsg = `[Procurement Log] ❌ NO MATCH for "${data.variant_name}". Available in DB: [${availNames}]`;
                                if (global.io) global.io.emit('procurement_log', logMsg);
                                console.warn(logMsg);
                            }

                            if (updated) {
                                variantsObj.items = items;
                                // Recalculate global stock from variants to prevent drift
                                const totalFromVariants = items.reduce((sum, v) => sum + (parseFloat(v.stock) || 0), 0);
                                updateQuery = 'UPDATE intelligent_product_catalog SET stock_quantity = ?, variants = ? WHERE id = ?';
                                params = [totalFromVariants, JSON.stringify(variantsObj), data.product_id];
                            }
                        }

                        if (!updateQuery) {
                            updateQuery = 'UPDATE intelligent_product_catalog SET stock_quantity = stock_quantity + ? WHERE id = ?';
                            params = [data.quantity, data.product_id];
                        }

                        db.run(updateQuery, params, (err) => {
                            if (err) {
                                db.run('ROLLBACK');
                                return reject(err);
                            }
                            db.run('COMMIT');
                            resolve({ id: procurementId });
                        });
                    });
                });
                stmt.finalize();
            });
        });
    },

    addProcurementsBatch: ({ items, expenses = [], payment = null } = {}) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                const totalProductCost = items.reduce((acc, i) => acc + (parseFloat(i.quantity) * parseFloat(i.purchase_price)), 0);
                const supplierPaidExpenses = (expenses || []).filter(e => e.paid_by === 'supplier').reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
                const selfPaidExpenses = (expenses || []).filter(e => e.paid_by === 'self');
                
                const totalSupplierCredit = totalProductCost + supplierPaidExpenses;
                const supplierName = items[0].supplier;
                const date = items[0].purchase_date || new Date().toISOString();

                // 1. Get or Create Supplier
                db.get('SELECT id FROM suppliers WHERE name = ?', [supplierName], (err, sRow) => {
                    if (err) { db.run('ROLLBACK'); return reject(err); }

                    const getSupplierId = () => {
                        return new Promise((resS) => {
                            if (sRow) resS(sRow.id);
                            else {
                                db.run('INSERT INTO suppliers (name) VALUES (?)', [supplierName], function (err) {
                                    if (err) { db.run('ROLLBACK'); reject(err); }
                                    else resS(this.lastID);
                                });
                            }
                        });
                    };

                    getSupplierId().then(supplierId => {
                        const batchId = `BATCH-${Date.now()}`;

                        // 2. Add Purchase Ledger Entry
                        const ledgerNote = `Batch Procurement: ${items.length} items` + (supplierPaidExpenses > 0 ? ` + ${supplierPaidExpenses} Logistic Cost` : '');
                        db.run(`
                            INSERT INTO supplier_ledger (supplier_id, type, amount, reference_id, note, date)
                            VALUES (?, 'purchase', ?, ?, ?, ?)
                        `, [supplierId, totalSupplierCredit, batchId, ledgerNote, date], function (err) {
                            if (err) { db.run('ROLLBACK'); return reject(err); }

                            // 2.1 Spot Payment if any
                            const recordSpotPayment = () => {
                                return new Promise((resP) => {
                                    if (!payment || !payment.amount || parseFloat(payment.amount) <= 0) return resP();
                                    db.run(`
                                        INSERT INTO supplier_ledger (supplier_id, type, amount, reference_id, note, date)
                                        VALUES (?, 'payment', ?, ?, ?, ?)
                                    `, [supplierId, parseFloat(payment.amount), batchId, payment.note || 'Spot Payment', date], (err) => {
                                        if (err) { db.run('ROLLBACK'); reject(err); }
                                        else resP();
                                    });
                                });
                            };

                            recordSpotPayment().then(() => {
                                // Calculate Landing Cost proportions
                                const totalBatchValue = items.reduce((acc, item) => acc + (parseFloat(item.quantity) * parseFloat(item.purchase_price)), 0);
                                const totalExpenses = (expenses || []).reduce((acc, exp) => acc + (parseFloat(exp.amount) || 0), 0);

                                // 3. Process Individual Items
                                const processItem = (index) => {
                                    if (index === items.length) {
                                        db.run('COMMIT');
                                        console.log(`[BatchProcurement] TRANSACTION COMMITTED. Total items processed: ${items.length}`);
                                        if (global.io) global.io.emit('intelligent_products_changed');
                                        return resolve({ success: true, count: items.length, batchId });
                                    }

                                    const data = items[index];
                                    const itemQty = parseFloat(data.quantity);
                                    const itemPrice = parseFloat(data.purchase_price);
                                    const itemValue = itemQty * itemPrice;
                                    
                                    // Proportional expense distribution (International Standard)
                                    const expenseShare = totalBatchValue > 0 ? (itemValue / totalBatchValue) * totalExpenses : (totalExpenses / items.length);
                                    const unitLandedCost = (itemValue + expenseShare) / itemQty;

                                    db.run(`
                                        INSERT INTO stock_procurements (product_id, variant_name, quantity, purchase_price, landed_cost, supplier, purchase_date, batch_id)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                    `, [data.product_id, data.variant_name || null, data.quantity, data.purchase_price, unitLandedCost, supplierName, date, batchId], function (err) {
                                        if (err) { db.run('ROLLBACK'); return reject(err); }

                                        // Update Stock & Landed Cost
                                        db.get('SELECT stock_quantity, variants FROM intelligent_product_catalog WHERE id = ?', [data.product_id], (err, product) => {
                                            if (err || !product) { db.run('ROLLBACK'); return reject(err || new Error('Product not found: ' + data.product_id)); }

                                            let updateQuery = '';
                                            let params = [];
                                            let finalStock = (parseFloat(product.stock_quantity) || 0) + itemQty;

                                            console.log(`[BatchProcurement] Item ${index + 1}: Processing product ${data.product_id}`);
                                            console.log(`[BatchProcurement] Input Variant: "${data.variant_name}", Qty: ${itemQty}`);

                                            if (data.variant_name && product.variants) {
                                                try {
                                                    let variantsObj = JSON.parse(product.variants);
                                                    let vItems = Array.isArray(variantsObj) ? variantsObj : (variantsObj.items || []);
                                                    let matched = false;

                                                    console.log(`[BatchProcurement] Found ${vItems.length} variants in DB for this product.`);

                                                    vItems = vItems.map(v => {
                                                        const dbVName = String(v.name || v.value || v.type || '').trim().toLowerCase();
                                                        const inputVName = String(data.variant_name).trim().toLowerCase();
                                                        const altVName = (String(v.type || '') + ': ' + String(v.value || '')).trim().toLowerCase();

                                                        if (dbVName === inputVName || altVName === inputVName || String(v.value || '').trim().toLowerCase() === inputVName || String(v.type || '').trim().toLowerCase() === inputVName) {
                                                            const oldVStock = parseFloat(v.stock) || 0;
                                                            v.stock = oldVStock + itemQty;
                                                            matched = true;
                                                            const logMsg = `[Procurement Log] Batch Entry - Match Found: "${v.name || v.type || v.value}": ${oldVStock} -> ${v.stock}`;
                                                            if (global.io) global.io.emit('procurement_log', logMsg);
                                                            console.log(logMsg);
                                                        }
                                                        return v;
                                                    });

                                                    if (matched) {
                                                        if (Array.isArray(variantsObj)) variantsObj = vItems; else variantsObj.items = vItems;
                                                        const newVariantsStr = JSON.stringify(variantsObj);
                                                        
                                                        // Recalculate total from variants to be 100% sure
                                                        finalStock = vItems.reduce((sum, v) => sum + (parseFloat(v.stock) || 0), 0);
                                                        
                                                        updateQuery = `UPDATE intelligent_product_catalog SET stock_quantity = ?, variants = ?, purchase_price = ?, landed_cost = ? WHERE id = ?`;
                                                        params = [finalStock, newVariantsStr, itemPrice, unitLandedCost, data.product_id];
                                                        console.log(`[BatchProcurement] SYNC: Recalculated total stock from variants: ${finalStock}`);
                                                    } else {
                                                        const availNames = vItems.map(v => `(Name: "${v.name}", Type: "${v.type}", Value: "${v.value}")`).join(', ');
                                                        const logMsg = `[Procurement Log] ❌ BATCH NO MATCH for "${data.variant_name}". Available in DB: [${availNames}]`;
                                                        if (global.io) global.io.emit('procurement_log', logMsg);
                                                        console.warn(logMsg);
                                                    }
                                                } catch (e) { 
                                                    console.error("[BatchProcurement] Variant parse error", e); 
                                                }
                                            }

                                            if (!updateQuery) {
                                                updateQuery = `UPDATE intelligent_product_catalog SET stock_quantity = ?, purchase_price = ?, landed_cost = ? WHERE id = ?`;
                                                params = [finalStock, itemPrice, unitLandedCost, data.product_id];
                                                console.log(`[BatchProcurement] GLOBAL UPDATE ONLY: New stock: ${finalStock}`);
                                            }

                                            db.run(updateQuery, params, (err) => {
                                                if (err) { 
                                                    console.error("[BatchProcurement] DB Update Error", err);
                                                    db.run('ROLLBACK'); 
                                                    return reject(err); 
                                                }
                                                processItem(index + 1);
                                            });
                                        });
                                    });
                                };

                                // 2.2 Add ALL Batch Expenses to 'expenses' table for Manifest visibility
                                const processBatchExpenses = (eIndex) => {
                                    if (!expenses || eIndex === expenses.length) return processItem(0);

                                    const exp = expenses[eIndex];
                                    // Map 'purpose' to 'category' and 'paid_by' info to description for better tracking
                                    const metaDesc = `Batch Logistics: ${exp.purpose} (${batchId}) [Paid by ${exp.paid_by}]`;
                                    
                                    db.run(`
                                        INSERT INTO expenses (category, amount, description, type, reference_id, expense_date, paid_by)
                                        VALUES (?, ?, ?, 'landed_logistics', ?, ?, ?)
                                    `, [exp.purpose || 'Logistics', exp.amount, metaDesc, batchId, date, exp.paid_by || 'self'], (err) => {
                                        if (err) { db.run('ROLLBACK'); return reject(err); }
                                        processBatchExpenses(eIndex + 1);
                                    });
                                };

                                // Trigger the single processing chain: Expenses -> Items -> Commit
                                processBatchExpenses(0);
                            });
                        });
                    });
                });
            });
        });
    },

    getSupplierBatches: (supplierId) => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    reference_id,
                    MAX(date) as date,
                    MAX(note) as note,
                    SUM(CASE WHEN type = 'purchase' THEN amount ELSE 0 END) as total_due,
                    SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) as total_paid
                FROM supplier_ledger
                WHERE supplier_id = ? AND reference_id LIKE 'BATCH-%'
                GROUP BY reference_id
                HAVING total_due > total_paid
                ORDER BY date DESC
            `;
            db.all(query, [supplierId], (err, rows) => {
                if (err) reject(err);
                else {
                    const batches = rows.map(r => ({
                        ...r,
                        balance: r.total_due - r.total_paid
                    }));
                    resolve(batches);
                }
            });
        });
    },

    getLastPurchasePrice: (productId, variantName) => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT purchase_price 
                FROM stock_procurements 
                WHERE product_id = ? AND (variant_name = ? OR (variant_name IS NULL AND ? IS NULL))
                ORDER BY purchase_date DESC, id DESC LIMIT 1
            `;
            db.get(query, [productId, variantName, variantName], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.purchase_price : null);
            });
        });
    },



    getFinanceOverview: (startDate = null, endDate = null) => {
        return new Promise((resolve, reject) => {
            const dateFilter = startDate && endDate ? `AND created_at BETWEEN '${startDate} 00:00:00' AND '${endDate} 23:59:59'` : '';
            const expenseDateFilter = startDate && endDate ? `AND expense_date BETWEEN '${startDate}' AND '${endDate}'` : '';
            const purchaseDateFilter = startDate && endDate ? `AND purchase_date BETWEEN '${startDate}' AND '${endDate}'` : '';

            // 1. Get Revenue & Order Items (Filtered by date)
            db.all(`SELECT items, total_amount, amount_paid, payment_status, status FROM orders WHERE status != 'cancelled' ${dateFilter}`, (err, orders) => {
                if (err) return reject(err);

                // 2. Get Average Cost map for all products/variants (ALL TIME - to reflect true COGS)
                db.all(`
                    SELECT 
                        product_id, 
                        variant_name, 
                        SUM(quantity * purchase_price) as total_purchase, 
                        SUM(quantity * landed_cost) as total_landed,
                        SUM(quantity) as total_qty
                    FROM stock_procurements
                    GROUP BY product_id, variant_name
                `, (err, costs) => {
                    if (err) return reject(err);

                    const costMap = {};
                    costs.forEach(c => {
                        const key = `${c.product_id}:${c.variant_name || 'base'}`;
                        const bestCost = (parseFloat(c.total_landed) || 0) > 0 ? c.total_landed : c.total_purchase;
                        costMap[key] = c.total_qty > 0 ? (bestCost / c.total_qty) : 0;
                    });

                    // 3. Get total expenses (Filtered by date, EXCLUDE landed_logistics)
                    db.get(`SELECT SUM(amount) as total FROM expenses WHERE type != 'landed_logistics' ${expenseDateFilter}`, (err, expenseData) => {
                        if (err) return reject(err);

                        // 3.1 Sustainability Calculation: Get Average All-Time Burn Rate
                        db.get("SELECT SUM(amount) as allTimeExpenses, MIN(expense_date) as firstDate FROM expenses WHERE type != 'landed_logistics'", (err, burner) => {
                            if (err) return reject(err);

                            // 4. Get Current Inventory Assets (Physical Stock Value - ALWAYS CURRENT)
                            db.get("SELECT SUM(stock_quantity * landed_cost) as totalValue, SUM(stock_quantity) as totalQty FROM intelligent_product_catalog WHERE stock_quantity > 0", (err, invData) => {
                                if (err) return reject(err);

                                // 5. Get Monthly/Period Spend Audit (Base vs Landed Spend)
                                db.get(`
                                    SELECT 
                                        SUM(quantity * purchase_price) as baseSpend, 
                                        SUM(quantity * landed_cost) as landedSpend
                                    FROM stock_procurements 
                                    WHERE 1=1 ${purchaseDateFilter}
                                `, (err, auditData) => {
                                    if (err) return reject(err);

                                    let totalRevenue = 0;
                                    let realizedCash = 0;
                                    let totalCOGS = 0;

                                    orders.forEach(order => {
                                        let amt = parseFloat(order.total_amount?.toString().replace(/[^0-9.]/g, '')) || 0;
                                        let paid = parseFloat(order.amount_paid) || 0;
                                        totalRevenue += amt;
                                        realizedCash += paid;

                                        try {
                                            const items = JSON.parse(order.items || '[]');
                                            items.forEach(item => {
                                                const variantKey = item.variant ? `${item.product_id}:${item.variant}` : `${item.product_id}:base`;
                                                const avgCost = costMap[variantKey] || costMap[`${item.product_id}:base`] || 0;
                                                totalCOGS += (avgCost * (item.quantity || 1));
                                            });
                                        } catch (e) { console.error("Order items parse error", e); }
                                    });

                                    const totalExpenses = expenseData.total || 0;
                                    const grossProfit = totalRevenue - totalCOGS;
                                    const netProfit = grossProfit - totalExpenses;

                                    // Tax Liability (Assuming 15% on Net Profit if positive)
                                    const taxLiability = netProfit > 0 ? (netProfit * 0.15) : 0;

                                    // Runway Logic
                                    let burnRate = 0;
                                    if (burner.firstDate) {
                                        const days = Math.max(1, (new Date().getTime() - new Date(burner.firstDate).getTime()) / (1000 * 3600 * 24));
                                        burnRate = (burner.allTimeExpenses || 0) / days;
                                    }

                                    resolve({
                                        totalRevenue,
                                        realizedCash,
                                        totalCOGS,
                                        grossProfit,
                                        totalExpenses,
                                        netProfit,
                                        taxLiability,
                                        burnRate,
                                        inventoryValue: invData.totalValue || 0,
                                        totalStockItems: invData.totalQty || 0,
                                        periodBaseSpend: auditData.baseSpend || 0,
                                        periodLandedSpend: auditData.landedSpend || 0,
                                        orderCount: orders.length
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    },

    getSuppliers: () => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    s.*,
                    COALESCE((SELECT SUM(amount) FROM supplier_ledger WHERE supplier_id = s.id AND type = 'purchase'), 0) as total_purchased,
                    COALESCE((SELECT SUM(amount) FROM supplier_ledger WHERE supplier_id = s.id AND type = 'payment'), 0) as total_paid
                FROM suppliers s
                ORDER BY s.name ASC
            `;
            db.all(query, (err, rows) => {
                if (err) reject(err);
                else {
                    const suppliers = rows.map(r => ({
                        ...r,
                        balance: r.total_purchased - r.total_paid
                    }));
                    resolve(suppliers);
                }
            });
        });
    },

    getSupplierLedger: (supplierId) => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_ledger WHERE supplier_id = ? ORDER BY date DESC, id DESC', [supplierId], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
    },

    addSupplierPayment: (data) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('INSERT INTO supplier_ledger (supplier_id, type, amount, reference_id, note, date) VALUES (?, "payment", ?, ?, ?, ?)');
            stmt.run(
                data.supplier_id, 
                data.amount, 
                data.reference_id || `PAY-${Date.now()}`, 
                data.note || 'Manual Payment', 
                data.date || new Date().toISOString(), 
                function(err) {
                    if (err) reject(err); else resolve({ id: this.lastID });
                }
            );
            stmt.finalize();
        });
    },

    addSupplier: (data) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('INSERT INTO suppliers (name, phone, address) VALUES (?, ?, ?)');
            stmt.run(data.name, data.phone || null, data.address || null, function(err) {
                if (err) reject(err); else resolve({ id: this.lastID });
            });
            stmt.finalize();
        });
    },

    getExpenses: (startDate = null, endDate = null) => {
        return new Promise((resolve, reject) => {
            const dateFilter = startDate && endDate ? `WHERE expense_date BETWEEN '${startDate}' AND '${endDate}'` : '';
            db.all(`SELECT * FROM expenses ${dateFilter} ORDER BY expense_date DESC`, [], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
    },

    getBatchExpenses: (batchId) => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM expenses WHERE reference_id = ? ORDER BY expense_date DESC`, [batchId], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
    },

    addExpense: (data) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('INSERT INTO expenses (category, amount, description, type, reference_id, expense_date) VALUES (?, ?, ?, ?, ?, ?)');
            stmt.run(
                data.category, 
                data.amount, 
                data.description, 
                data.type || 'indirect', 
                data.reference_id || null, 
                data.date || new Date().toISOString(),
                function(err) {
                    if (err) reject(err); else resolve({ id: this.lastID });
                }
            );
            stmt.finalize();
        });
    },

    deleteExpense: (id) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses WHERE id = ?', [id], (err) => {
                if (err) reject(err); else resolve({ success: true });
            });
        });
    },

    recalculateCustomerLTV: (number) => {
        return new Promise((resolve, reject) => {
            // Sum all non-cancelled orders for this customer
            db.get(`
                SELECT SUM(CAST(REPLACE(REPLACE(REPLACE(total_amount, '৳', ''), ',', ''), 'Tk', '') AS FLOAT)) as ltv 
                FROM orders 
                WHERE customer_number = ? AND status NOT IN ('cancelled', 'merged') AND is_debt_transferred = 0
            `, [number], (err, row) => {
                if (err) return reject(err);
                const ltv = row?.ltv || 0;
                
                // Update the customer's lifetime value and stage
                db.run(`
                    UPDATE customers 
                    SET lifetime_value = ?, 
                        lifecycle_stage = CASE WHEN ? > 0 THEN 'customer' ELSE lifecycle_stage END
                    WHERE number = ?
                `, [ltv, ltv, number], function(err) {
                    if (err) reject(err);
                    else resolve({ ltv, changes: this.changes });
                });
            });
        });
    },

    getUniqueCustomerNumbersFromOrders: () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT DISTINCT customer_number FROM orders', [], (err, rows) => {
                if (err) reject(err); else resolve(rows || []);
            });
        });
    },

    // ── Semantic Caching ──────────────────────────────────────────────────────────
    getCatalogVersionHash: () => {
        return new Promise((resolve) => {
            db.get('SELECT MAX(id) as maxId, COUNT(*) as cnt, SUM(stock_quantity) as totalStock FROM intelligent_product_catalog', [], (err, row) => {
                if (err || !row) return resolve('v1_default');
                const state = `${row.maxId || 0}_${row.cnt || 0}_${row.totalStock || 0}`;
                const crypto = require('crypto');
                const hash = crypto.createHash('md5').update(state).digest('hex');
                resolve(hash);
            });
        });
    },

    getCachedAIResponse: (queryHash) => {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            db.get('SELECT * FROM ai_response_cache WHERE query_hash = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY id DESC LIMIT 1', [queryHash, now], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });
    },

    getCachedAIResponseByIntent: (intentKey, tenantId = 'default') => {
        return new Promise((resolve) => {
            const now = new Date().toISOString();
            db.get('SELECT * FROM ai_response_cache WHERE intent_key = ? AND (tenant_id = ? OR tenant_id IS NULL) AND (expires_at IS NULL OR expires_at > ?) ORDER BY id DESC LIMIT 1', [intentKey, tenantId, now], (err, row) => {
                if (err) return resolve(null);
                resolve(row);
            });
        });
    },

    getRecentCachedAIResponses: (limit = 100) => {
        return new Promise((resolve) => {
            const now = new Date().toISOString();
            db.all('SELECT * FROM ai_response_cache WHERE (expires_at IS NULL OR expires_at > ?) ORDER BY id DESC LIMIT ?', [now, limit], (err, rows) => {
                if (err) return resolve([]);
                resolve(rows || []);
            });
        });
    },

    saveCachedAIResponse: (data) => {
        return new Promise((resolve) => {
            const query = 'INSERT OR REPLACE INTO ai_response_cache (query_hash, pure_query, product_id, response_text, vector, metadata, intent_key, tenant_id, catalog_version_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
            db.run(query, [
                data.queryHash,
                data.pureQuery,
                data.productId || null,
                data.responseText,
                data.vector || null,
                data.metadata ? JSON.stringify(data.metadata) : null,
                data.intentKey || null,
                data.tenantId || 'default',
                data.catalogVersionHash || null,
                data.expiresAt || null
            ], function(err) {
                if (err) {
                    // Fallback to legacy schema if columns not added yet
                    db.run('INSERT OR REPLACE INTO ai_response_cache (query_hash, pure_query, product_id, response_text, vector, metadata, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
                        data.queryHash, data.pureQuery, data.productId || null, data.responseText, data.vector || null, data.metadata ? JSON.stringify(data.metadata) : null, data.expiresAt || null
                    ], () => resolve({ id: 0 }));
                } else {
                    resolve({ id: this.lastID });
                }
            });
        });
    },

    invalidateProductCache: (productId) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM ai_response_cache WHERE product_id = ?', [productId], function(err) {
                if (err) reject(err); else resolve({ changes: this.changes });
            });
        });
    },

    invalidateTenantCache: (tenantId = 'default') => {
        return new Promise((resolve) => {
            // Keep golden templates intact during CDC invalidation
            db.run('DELETE FROM ai_response_cache WHERE (is_golden IS NULL OR is_golden = 0) AND (tenant_id = ? OR tenant_id IS NULL)', [tenantId], function(err) {
                if (err) db.run('DELETE FROM ai_response_cache', [], () => resolve({ changes: 0 }));
                else resolve({ changes: this ? this.changes : 0 });
            });
        });
    },

    incrementCacheHit: (id) => {
        return new Promise((resolve) => {
            db.run('UPDATE ai_response_cache SET hit_count = COALESCE(hit_count, 1) + 1 WHERE id = ?', [id], () => resolve());
        });
    },

    getCacheClusters: (tenantId = 'default') => {
        return new Promise((resolve) => {
            db.all('SELECT * FROM ai_response_cache WHERE (tenant_id = ? OR tenant_id IS NULL) ORDER BY id DESC', [tenantId], (err, rows) => {
                if (err) return resolve([]);
                const clusters = {};
                (rows || []).forEach(row => {
                    const ik = row.intent_key || 'UNASSIGNED';
                    if (!clusters[ik]) {
                        clusters[ik] = {
                            intent_key: ik,
                            total_queries: 0,
                            total_hits: 0,
                            golden_count: 0,
                            items: []
                        };
                    }
                    clusters[ik].total_queries += 1;
                    clusters[ik].total_hits += (row.hit_count || 1);
                    if (row.is_golden) clusters[ik].golden_count += 1;
                    clusters[ik].items.push(row);
                });
                resolve(Object.values(clusters));
            });
        });
    },

    updateCacheResponse: (id, responseText, isGolden = 0, intentKey = null) => {
        return new Promise((resolve, reject) => {
            const fields = ['response_text = ?', 'is_golden = ?'];
            const params = [responseText, isGolden ? 1 : 0];
            if (intentKey) {
                fields.push('intent_key = ?');
                params.push(intentKey);
            }
            params.push(id);
            db.run(`UPDATE ai_response_cache SET ${fields.join(', ')} WHERE id = ?`, params, function(err) {
                if (err) reject(err); else resolve({ success: true, changes: this.changes });
            });
        });
    },

    reassignCacheIntent: (id, targetIntent) => {
        return new Promise((resolve, reject) => {
            db.run('UPDATE ai_response_cache SET intent_key = ? WHERE id = ?', [targetIntent, id], function(err) {
                if (err) reject(err); else resolve({ success: true, changes: this.changes });
            });
        });
    },

    deleteCacheItem: (id) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM ai_response_cache WHERE id = ?', [id], function(err) {
                if (err) reject(err); else resolve({ success: true, changes: this.changes });
            });
        });
    },

    getCacheAnalytics: (tenantId = 'default') => {
        return new Promise((resolve) => {
            db.get(`
                SELECT 
                    COUNT(*) as total_cached_entries,
                    SUM(COALESCE(hit_count, 1)) as total_hits,
                    SUM(CASE WHEN is_golden = 1 THEN 1 ELSE 0 END) as golden_templates_count
                FROM ai_response_cache
                WHERE (tenant_id = ? OR tenant_id IS NULL)
            `, [tenantId], (err, row) => {
                if (err || !row) return resolve({ total_cached_entries: 0, total_hits: 0, golden_templates_count: 0, estimated_tokens_saved: 0, estimated_cost_saved: 0 });
                const totalHits = row.total_hits || 0;
                const estimatedTokensSaved = totalHits * 1800; // Baseline ~1800 tokens saved per hit
                const estimatedCostSaved = (estimatedTokensSaved / 1000000) * 0.35; // $0.35 per 1M tokens average
                resolve({
                    total_cached_entries: row.total_cached_entries || 0,
                    total_hits: totalHits,
                    golden_templates_count: row.golden_templates_count || 0,
                    estimated_tokens_saved: estimatedTokensSaved,
                    estimated_cost_saved: parseFloat(estimatedCostSaved.toFixed(4))
                });
            });
        });
    },

    getUnrepliedIncomingMessages: (hours = 24) => {
        const timeThreshold = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT m1.id, m1.number, m1.text, m1.timestamp, m1.metadata, c.name as contact_name
                FROM messages m1
                LEFT JOIN customers c ON c.number = m1.number
                WHERE m1.type = 'received' 
                  AND m1.timestamp >= ?
                  AND (c.ai_paused IS NULL OR c.ai_paused = 0)
                  AND (c.handover_requested IS NULL OR c.handover_requested = 0)
                  AND NOT EXISTS (
                      SELECT 1 FROM messages m2 
                      WHERE m2.number = m1.number 
                        AND (m2.type = 'sent' OR m2.type = 'outbox' OR m2.type LIKE 'error%' OR m2.type = 'failed') 
                        AND m2.timestamp >= m1.timestamp
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM outgoing_queue oq
                      WHERE oq.chat_id LIKE '%' || m1.number || '%'
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM ai_generation_queue agq
                      WHERE (agq.chat_id LIKE '%' || m1.number || '%' OR agq.payload LIKE '%' || m1.number || '%')
                  )
                ORDER BY m1.id ASC
            `, [timeThreshold], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    },

    isAIRetryQueuedForNumber: (number) => {
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            db.get(`
                SELECT id FROM ai_generation_queue 
                WHERE (chat_id = ? OR payload LIKE ?) AND status IN ('pending', 'processing')
            `, [cleanNumber, `%${cleanNumber}%`], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });
    },

    db: db
};


module.exports = dbUtils;
