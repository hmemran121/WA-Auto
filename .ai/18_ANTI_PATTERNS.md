# 18_ANTI_PATTERNS.md — Strictly Forbidden Coding Anti-Patterns

## 🚫 HALL OF SHAME: FORBIDDEN ANTI-PATTERNS

The following coding practices are strictly forbidden across the **WA-Auto** repository. Violations are considered critical engineering failures.

---

## ❌ 1. SILENT TRY/CATCH BLOCKS

```javascript
// ❌ CRITICAL VIOLATION: Swallowing errors silently
try {
  await sendWhatsAppMessage(phone, message);
} catch (err) {
  console.log('error happened'); // Error swallowed! Campaign state corrupted!
}

// ✅ MANDATORY: Structured handling & error logging
try {
  await sendWhatsAppMessage(phone, message);
} catch (err) {
  logger.error('[WA_SEND_FAILED]', { phone, error: err.message, stack: err.stack });
  await updateMessageStatus(campaignId, phone, 'FAILED', err.message);
  throw err;
}
```

---

## ❌ 2. UNBOUNDED ASYNC DELAY LOOPS

```javascript
// ❌ CRITICAL VIOLATION: Non-interruptible sleep loop
await new Promise(resolve => setTimeout(resolve, 300000)); // Hanging pause! User cannot cancel!

// ✅ MANDATORY: Interruptible delay loop
await interruptibleHumanDelay(300000, campaignId, globalState);
```

---

## ❌ 3. RAW SQL CONCATENATION

```javascript
// ❌ CRITICAL VIOLATION: SQL Injection vulnerability
db.run(`UPDATE contacts SET status = '${status}' WHERE phone = '${phone}'`);

// ✅ MANDATORY: Parameterized SQL query
db.run('UPDATE contacts SET status = ? WHERE phone = ?', [status, phone]);
```

---

## ❌ 4. LEAKING SOCKET LISTENERS IN REACT

```tsx
// ❌ CRITICAL VIOLATION: Missing useEffect cleanup (Memory Leak!)
useEffect(() => {
  socket.on('status', updateStatus);
}, []); // Duplicate listeners attached on every re-render!

// ✅ MANDATORY: Socket cleanup on unmount
useEffect(() => {
  socket.on('status', updateStatus);
  return () => { socket.off('status', updateStatus); };
}, []);
```

---

## ❌ 5. TAILWIND UTILITY INJECTION

```tsx
// ❌ CRITICAL VIOLATION: Using Tailwind classes when Vanilla CSS Nexus system is active
<button className="bg-blue-500 hover:bg-blue-700 text-white p-4 rounded-xl">

// ✅ MANDATORY: Reusable Nexus CSS class
<button className="nexus-btn nexus-btn-primary">
```
