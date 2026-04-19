const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { formatNumber } = require('./utils/phoneFormatter');

const dbFile = process.env.NODE_ENV === 'test' ? 'test_data.db' : 'data.db';
const db = new sqlite3.Database(path.join(__dirname, dbFile));

// Optimization: PRAGMAs for performance and integrity
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA busy_timeout = 10000'); // Wait up to 10s for locks
db.run('PRAGMA foreign_keys = ON');

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
      last_purchase TEXT
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
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
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
      respect_execution_windows INTEGER DEFAULT 1
    );
  `);

    // ── Performance Indexes ─────────────────────────────────
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp_status ON messages(timestamp, status);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_campaign_id ON messages(campaign_id);`);

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
    });

    db.run(`
    CREATE TABLE IF NOT EXISTS knowledge_documents(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT DEFAULT 'faq',
        embedding TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `);

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
        { k: 'carry_over_limit', v: '0' }
    ];

    defaultSettings.forEach(s => {
        db.run(`INSERT OR IGNORE INTO app_settings(key, value) VALUES(?, ?)`, [s.k, s.v]);
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
        { table: 'customers', name: 'handover_requested', type: 'INTEGER DEFAULT 0' }
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
                ORDER BY m.id DESC LIMIT 200
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
        const { name, number, email, address, city, companyName, lastPurchase } = data;
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('INSERT OR IGNORE INTO customers (name, number, email, address, city, company_name, last_purchase) VALUES (?, ?, ?, ?, ?, ?, ?)');
            stmt.run(name, cleanNumber, email, address, city, companyName, lastPurchase, function (err) {
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
        const { name, number, email, address, city, companyName, lastPurchase } = data;
        const cleanNumber = formatNumber(number);
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`
                UPDATE customers 
                SET name = ?, number = ?, email = ?, address = ?, city = ?, company_name = ?, last_purchase = ?
    WHERE id = ?
        `);
            stmt.run(name, cleanNumber, email, address, city, companyName, lastPurchase, id, function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
            stmt.finalize();
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
                    // Return Oldest to Newest for LLM context
                    const history = rows.reverse().map(m => `${m.type === 'received' ? 'Customer' : 'AI'}: ${m.text}`).join('\n');
                    resolve(history);
                }
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
        const { search, url, limit = 10000, offset = 0 } = options;
        return new Promise((resolve, reject) => {
            let query = `SELECT * FROM intelligent_product_catalog`;
            const params = [];

            if (url) {
                query += ` WHERE product_url = ? `;
                params.push(url);
            } else if (search) {
                query += ` WHERE name LIKE ? OR description LIKE ? `;
                params.push(`%${search}%`, `%${search}%`);
            }
            query += ` ORDER BY updated_at DESC LIMIT ? OFFSET ? `;
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
        const { name, sku, price, description, full_description, image_url, product_url, variants, source = 'manual', manual_override = 1, vector_id, embedding, regular_price, sale_price } = data;
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`
                INSERT INTO intelligent_product_catalog(
        name, sku, price, description, full_description, image_url, product_url, variants, source, manual_override, vector_id, embedding, regular_price, sale_price, technical_attributes
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const variantsStr = variants ? (typeof variants === 'string' ? variants : JSON.stringify(variants)) : '{}';
            stmt.run(
                name, sku, price, description, full_description, image_url, product_url, variantsStr,
                source, manual_override, vector_id, embedding, regular_price, sale_price,
                data.technical_attributes || data.specifications || "",
                function (err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
            stmt.finalize();
        });
    },

    updateAIProduct: (id, data) => {
        const { name, sku, price, description, full_description, image_url, product_url, variants, manual_override, vector_id, embedding, regular_price, sale_price } = data;
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
            if (variants !== undefined) { fields.push('variants = ?'); params.push(typeof variants === 'string' ? variants : JSON.stringify(variants)); }
            if (manual_override !== undefined) { fields.push('manual_override = ?'); params.push(manual_override); }
            if (vector_id !== undefined) { fields.push('vector_id = ?'); params.push(vector_id); }
            if (embedding !== undefined) { fields.push('embedding = ?'); params.push(embedding); }
            if (regular_price !== undefined) { fields.push('regular_price = ?'); params.push(regular_price); }
            if (sale_price !== undefined) { fields.push('sale_price = ?'); params.push(sale_price); }
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
                else resolve({ success: true });
            });
        });
    },

    bulkDeleteAIProducts: (ids) => {
        return new Promise((resolve, reject) => {
            if (!ids || ids.length === 0) return resolve({ success: true, deleted: 0 });
            const placeholders = ids.map(() => '?').join(',');
            db.run(`DELETE FROM intelligent_product_catalog WHERE id IN (${placeholders})`, ids, function (err) {
                if (err) reject(err);
                else resolve({ success: true, deleted: this.changes });
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
                else resolve({ success: true, deleted: this.changes });
            });
        });
    },

    deleteAIProduct: (id) => {
        return new Promise((resolve, reject) => {
            db.run(`DELETE FROM intelligent_product_catalog WHERE id = ? `, [id], function (err) {
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

    bulkDeleteAIProductsByFilter: (options = {}) => {
        const { search } = options;
        return new Promise((resolve, reject) => {
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
    getKnowledgeDocuments: () => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM knowledge_documents ORDER BY created_at DESC`, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    addKnowledgeDocument: (title, content, type = 'faq', embedding = null) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`INSERT INTO knowledge_documents(title, content, type, embedding) VALUES(?, ?, ?, ?)`);
            stmt.run(title, content, type, embedding, function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
            stmt.finalize();
        });
    },

    updateKnowledgeDocument: (id, title, content, type, embedding) => {
        return new Promise((resolve, reject) => {
            const fields = [];
            const params = [];

            if (title !== undefined) { fields.push('title = ?'); params.push(title); }
            if (content !== undefined) { fields.push('content = ?'); params.push(content); }
            if (type !== undefined) { fields.push('type = ?'); params.push(type); }
            if (embedding !== undefined) { fields.push('embedding = ?'); params.push(embedding); }

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
            const { customer_number, user_query, ai_response, context_used, confidence_score, is_handover } = data;
            const stmt = db.prepare(`
                INSERT INTO ai_logs (customer_number, user_query, ai_response, context_used, confidence_score, is_handover)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            stmt.run(customer_number, user_query, ai_response, context_used, confidence_score, is_handover ? 1 : 0, function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
            stmt.finalize();
        });
    },

    getAILogs: (limit = 50, offset = 0) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM ai_logs 
                ORDER BY timestamp DESC 
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
                            resolve(stats);
                        });
                    });
                });
            });
        });
    },
};

module.exports = dbUtils;
