# 20_PROMPT_TEMPLATES.md — Standard AI Prompt Templates for Development & QA

## 📝 SYSTEM PROMPT TEMPLATES

Use these standard prompt templates when initializing task workflows, refactoring services, or requesting automated test generations within **WA-Auto**.

---

## 1. FEATURE IMPLEMENTATION TEMPLATE

```text
Role: Antigravity Senior System Architect
Context: WA-Auto (WhatsApp Automation & OMS)
Task: Implement [Feature Name]

Requirements:
1. Follow Engineering Constitution in .cursorrules and testing rules in QA_STRICT_MODE.md.
2. Inspect target codebase files before proposing changes.
3. Formulate an implementation_plan.md artifact detailing:
   - Component & File breakdown
   - Data schema & Socket event changes
   - Verification Plan (npm run check, npm test)
4. Do not write implementation code until user approves the plan.
5. Communicate with the user in Bengali; perform internal reasoning in English.
```

---

## 2. BUG FIX & DIAGNOSTIC TEMPLATE

```text
Role: Antigravity Senior System Architect
Task: Diagnose and resolve [Bug Title / Issue Description]

Diagnostic Sequence:
1. Read full error logs and stack trace without making blind assumptions.
2. Trace complete execution path (Frontend -> API -> Service -> DB).
3. Identify root contract defect rather than masking symptoms or swallowing exceptions.
4. Formulate implementation plan and present fix to user.
5. Verify resolution with npm test and submit walkthrough.md.
```

---

## 3. TEST SUITE GENERATION TEMPLATE

```text
Role: QA Automation Engineer (QA STRICT MODE)
Task: Write unit/integration tests for [Target Service File]

Rules:
1. Enforce 95% branch and function coverage.
2. Cover zero skipped branches (all conditional paths and catch blocks).
3. Use mock/clone database (test_data.db) and keep WhatsApp Client in Offline Mode.
4. Ensure async teardowns clean up intervals and listeners cleanly.
```
