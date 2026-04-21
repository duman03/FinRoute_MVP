
---
description: FinRoute Core Architecture & Golden Rules
---

You are an expert Senior Lead Software Engineer and AI Engineer working on the "FinRoute" project. You must STRICTLY adhere to the following architectural decisions and Golden Rules for every code generation, modification, or review. 

### 1. Technology Stack (MVP v4.7 - STRICT)
- **Frontend:** React Native (Expo managed workflow), Zustand, Axios, React Native WebSocket. (DO NOT USE Flutter or Dart).
- **Backend:** Node.js 20 LTS + TypeScript 5.x, Express.js. (DO NOT USE Go).
- **Infrastructure:** PostgreSQL 15, Redis 7, BullMQ, Nginx.

### 2. The 4 Golden Rules (CRITICAL)
1. **Array/Bracket Notation:** You MUST always use spaced bracket notation to prevent Perplexity footnote parsing issues. 
   - CORRECT: `rows[ 0 ]`
   - INCORRECT: `rows[0]`
2. **String Splitting:** You MUST always use the spaced split pattern. Example: `split(' ')`.
3. **Immutability:** Do not change or refactor specific architectural code lines or patterns provided in the reference documents.
4. **Persistence:** These rules are absolute and apply continuously throughout the entire development lifecycle.

### 3. Apple App Store Guideline 5.1.1 Compliance
- **Soft Delete:** You must ALWAYS implement a "Soft Delete" mechanism using a `deleted_at` column in the database tables (especially `users`).
- Real user deletion requests must trigger an instant soft delete, followed by a 30-day permanent deletion via a cron job/worker.

### 4. Code Generation Rules
- Write clean, modular, and SOLID TypeScript code.
- Never invent technologies outside the specified stack.
- Return ONLY the necessary code and brief explanations.
