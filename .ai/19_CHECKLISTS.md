# 19_CHECKLISTS.md — Operational Checklists for Development, QA & Release

## 📋 DEVELOPMENT & QA CHECKLISTS

Use these operational checklists to guide planning, execution, verification, and code review steps.

---

## 🔍 PHASE 1: PRE-FLIGHT PLANNING CHECKLIST
- [ ] Read [`.cursorrules`](file:///g:/Antigravity/WA-Auto/.cursorrules) and [`QA_STRICT_MODE.md`](file:///g:/Antigravity/WA-Auto/QA_STRICT_MODE.md).
- [ ] Inspect dependent source files completely using `view_file` or `grep_search`.
- [ ] Verify if target files touch restricted zones ([`backend/db.js`](file:///g:/Antigravity/WA-Auto/backend/db.js), [`backend/server.js`](file:///g:/Antigravity/WA-Auto/backend/server.js), [`backend/scheduler.js`](file:///g:/Antigravity/WA-Auto/backend/scheduler.js), [`backend/whatsapp-service.js`](file:///g:/Antigravity/WA-Auto/backend/whatsapp-service.js)).
- [ ] Formulate [`implementation_plan.md`](file:///C:/Users/hmemr/.gemini/antigravity-ide/brain/f6f574e6-76fe-4990-8cd8-b7a7a0a151f7/implementation_plan.md) with proposed changes and verification plan.
- [ ] Obtain explicit user approval in Bengali.

---

## 💻 PHASE 2: CODE IMPLEMENTATION CHECKLIST
- [ ] Enforce atomic edits (one responsibility per function/module).
- [ ] Validate input parameters using Zod schemas.
- [ ] Wrap database queries in parameterized SQL statements.
- [ ] Use `interruptibleHumanDelay` for any async messaging pauses.
- [ ] Ensure Socket.io events emit real-time updates and include proper cleanup on the frontend.
- [ ] Retain semantic constants (`BATCH_MAX`, `DELAY_MIN`, `BREAK_MIN`).

---

## 🧪 PHASE 3: VERIFICATION & AUDIT CHECKLIST
- [ ] Run `npm run check` (TypeScript check) -> Ensure ZERO errors or warnings.
- [ ] Run `npm test` -> Ensure 95% branch coverage and ZERO failing assertions.
- [ ] Verify campaign recovery flow (`recoverCampaigns`) against a test database copy.
- [ ] Confirm no orphan Chromium browser processes remain active.
- [ ] Create/Update [`walkthrough.md`](file:///C:/Users/hmemr/.gemini/antigravity-ide/brain/f6f574e6-76fe-4990-8cd8-b7a7a0a151f7/walkthrough.md) with terminal outputs and summary.
- [ ] Formulate final report in Bengali with clickable `file://` links.
