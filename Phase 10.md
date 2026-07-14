PHASE 10 — Testing
Goal: Write automated tests so you can change code with confidence. This is the single biggest thing separating a hobby project from a professional one.

Why testing matters (the real reason)
Right now, every time you change code, you manually test in Postman. That's slow and you forget edge cases. Worse — when you change one thing, you might break something else and not notice.

Without tests:  change code → manually click through Postman → hope nothing else broke
With tests:     change code → run `npm test` → instantly know if ANYTHING broke
Tests are a safety net. They let you refactor fearlessly because if you break something, a test fails immediately and tells you exactly what.

The testing pyramid — three levels

        ╱╲          E2E tests (few)
       ╱  ╲         test the whole system together, slow, realistic
      ╱────╲
     ╱      ╲       Integration tests (some)
    ╱        ╲      test a route → controller → database together
   ╱──────────╲
  ╱            ╲    Unit tests (many)
 ╱──────────────╲   test ONE function in isolation, fast

Unit tests — test one small function alone (e.g., buildNotification('ORDER_PLACED') returns the right text). Fast, lots of them.

Integration tests — test an endpoint end-to-end within one service (e.g., POST /auth/register actually creates a user). Fewer, slower.

E2E tests — test the whole system (multiple services + gateway). Few, slowest.

We'll focus on unit and integration — the most valuable for learning, and the bulk of real test suites.

The tools

Jest        → the test runner & assertion library (runs tests, checks results)
ts-jest     → lets Jest understand TypeScript
supertest   → simulates HTTP requests to your Express app (for integration tests)

---------------------------------

Step 1 — Set up testing in auth-service
We'll start with auth-service since you know it best.


cd "c:\Users\Admin\OneDrive\Desktop\Mini Project\auth-service"
npm install --save-dev jest ts-jest @types/jest supertest @types/supertest

---------------------------------

Step 2 — Create the Jest config
Create auth-service/jest.config.js:


module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  clearMocks: true
};
What this does:

preset: 'ts-jest' — run TypeScript test files directly.
testEnvironment: 'node' — we're testing backend code, not browser.
testMatch: ['**/*.test.ts'] — any file ending in .test.ts is a test.
clearMocks: true — reset mocks between tests so they don't interfere.

-----------------------------

Step 3 — Your first UNIT test (the concept, simplest case)
Let's test a pure function first — no database, no HTTP. We need a function to test. Create a small utility we can verify.

Create auth-service/src/utils/validation.ts:


export function isValidEmail(email: string): boolean {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

export function isStrongPassword(password: string): boolean {
  return password.length >= 8;
}
Now create the test auth-service/src/utils/validation.test.ts:


import { isValidEmail, isStrongPassword } from './validation';

describe('isValidEmail', () => {
  it('returns true for a valid email', () => {
    expect(isValidEmail('user@test.com')).toBe(true);
  });

  it('returns false for an email with no @', () => {
    expect(isValidEmail('usertest.com')).toBe(false);
  });

  it('returns false for an email with no domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });
});

describe('isStrongPassword', () => {
  it('returns true for an 8+ character password', () => {
    expect(isStrongPassword('password123')).toBe(true);
  });

  it('returns false for a short password', () => {
    expect(isStrongPassword('abc')).toBe(false);
  });
});
Understanding the structure:


describe('group name', () => { ... })   → groups related tests
it('what it should do', () => { ... })  → one individual test
expect(actual).toBe(expected)           → the assertion: "I expect X to equal Y"
Read each test as a sentence: "it returns true for a valid email." That readability is intentional — tests document how your code is supposed to behave.

expect(isValidEmail('user@test.com')).toBe(true) means: "call the function with this input, and I expect the result to be true." If it isn't, the test fails and Jest tells you.

--------------------------

1) Purpose of validation.ts and validation.test.ts

validation.ts       → the REAL code. Functions your app actually uses.
                       isValidEmail(), isStrongPassword()

validation.test.ts  → the TEST code. Checks that validation.ts works correctly.
                       Never runs in production. Only runs when you do `npm test`.
They're a pair. The convention is: for a file X.ts, its tests live in X.test.ts right next to it.


src/utils/
├── validation.ts        ← code
└── validation.test.ts   ← tests for that code
validation.test.ts imports the functions from validation.ts, feeds them inputs, and asserts the outputs are correct. If you later change isValidEmail and accidentally break it, the test fails instantly and tells you.

Honest note: I created these two files specifically as a teaching example — a pure function with no database is the simplest possible thing to test. Your app wasn't actually using isValidEmail before. In a real project you'd write tests for code that already exists, not invent code to test. We'll do that next with the real register endpoint.


1) What I meant by that "honest note"
Normally, testing works like this:


NORMAL ORDER:
1. You write real code that your app uses        (e.g. the register endpoint)
2. THEN you write tests to verify that code works
But for teaching the very first test, I did it backwards:


WHAT I DID (for teaching):
1. I invented two brand-new functions (isValidEmail, isStrongPassword)
   that your app does NOT actually use anywhere
2. Then wrote tests for them
Why did I do that? Because the simplest possible thing to test is a pure function — one that takes an input and returns an output, with no database, no HTTP, no complexity:


isValidEmail('user@test.com')  →  returns true
That's perfect for learning the mechanics of testing (describe, it, expect) without also fighting with databases at the same time. One new concept at a time.

The honesty part: I wanted you to know those two functions are throwaway teaching examples — your real app never calls isValidEmail. I didn't want you thinking "wait, where is this used?" In a real project you don't invent functions just to test them. You test the code you already wrote.


So:
  isValidEmail / isStrongPassword  →  teaching props (not real app code)
  register / login / placeOrder    →  your REAL code (what we test next)
The next test we write will be against your actual POST /auth/register endpoint — code that already exists and your app actually uses. That's the realistic way.

You can even delete validation.ts and validation.test.ts later — they served their purpose (teaching you the test loop) and aren't part of your real app.

--------------------------

We do need this kind of functions to validate our inputs from clients but we have not used in the code ? why ?

This is a genuinely excellent catch. You've spotted a real flaw. Let me be honest about it.

What our current code does for validation
Look at the register controller — its validation is manual and minimal:


if (!email || !password || !name) {
  res.status(400).json({ error: 'Email, password and name are required' });
  return;
}
That only checks the fields exist. It does NOT check:

Is the email actually a valid email format? ("banana" would pass!)
Is the password strong enough? ("1" would pass!)
Is the name a reasonable length?
So right now, someone could register with email: "banana", password: "1" and our code would happily accept it. That's a real bug. Your isValidEmail / isStrongPassword functions are exactly what should be plugged in here — but aren't yet.

Why isn't it wired in?
Honestly? Because when we built the auth controller in Phase 4, I kept validation deliberately minimal to focus on the bigger concepts (JWT, hashing, the request flow). Proper input validation is item #4 on our hardening backlog:


4. Input validation library (Zod/Joi)  ← we deferred this
7. Fix privilege-escalation bug          ← also deferred
So this is a known, deliberate gap — not an accident. We chose to learn the architecture first and harden later, exactly as you decided.

The honest situation

isValidEmail / isStrongPassword:
  - I created them as TEACHING examples for the test lesson
  - They happen to be EXACTLY what real validation needs
  - But they're not wired into the controller yet
  - → that's the gap you correctly spotted
How real production validation is done
In production you usually don't hand-write isValidEmail with regex. You use a validation library like Zod that validates an entire request body declaratively:


// What we'd add during hardening (Zod example)
const registerSchema = z.object({
  email: z.string().email(),              // must be valid email
  password: z.string().min(8),            // at least 8 chars
  name: z.string().min(2).max(50)         // reasonable name
});

// in the controller:
const result = registerSchema.safeParse(req.body);
if (!result.success) {
  res.status(400).json({ error: result.error.issues });
  return;
}
One schema validates the whole body, gives precise error messages, and is type-safe. That's the professional approach.

--------------------------

Step 4 — Add the test script and run it
Add to auth-service/package.json scripts:


"scripts": {
  "dev": "nodemon --exec ts-node src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "test": "jest"
}
Run:


npm test
You should see something like:


PASS  src/utils/validation.test.ts
  isValidEmail
    ✓ returns true for a valid email
    ✓ returns false for an email with no @
    ...
  isStrongPassword
    ✓ returns true for an 8+ character password
    ✓ returns false for a short password

Tests: 6 passed, 6 total
That green output is the goal. Six tests, all passing, in under a second.

--------------------------

"Are all unit tests just inputs we think are good to test?"
Partly — but the skill is choosing inputs deliberately, not randomly. You don't test "good" inputs only. You test categories:


For any function, test these CATEGORIES of input:

1. HAPPY PATH    → normal, expected input        → isValidEmail('user@test.com') → true
2. EDGE CASES    → boundaries, unusual-but-valid  → password exactly 8 chars
3. INVALID INPUT → wrong/malformed                → isValidEmail('no-at-sign')   → false
4. EMPTY/NULL    → nothing, empty, undefined      → isValidEmail('')             → false
A good test suite covers all four categories for each function. That's how you decide "what inputs to test" — not by guessing, but by systematically covering these categories.

"Where are the edge cases?"
Look at the tests I gave you — they're already there, just not labeled:


expect(isValidEmail('user@test.com')).toBe(true);    // ← happy path
expect(isValidEmail('usertest.com')).toBe(false);    // ← invalid (no @)
expect(isValidEmail('user@')).toBe(false);           // ← edge case (no domain)
expect(isValidEmail('')).toBe(false);                // ← empty input
The skill is asking: "What weird input could break this?" For isStrongPassword (rule: length ≥ 8), the critical edge case is the boundary:


expect(isStrongPassword('1234567')).toBe(false);   // 7 chars — just below
expect(isStrongPassword('12345678')).toBe(true);   // exactly 8 — the boundary
Bugs love boundaries — "off by one" errors (> vs >=) hide exactly there. Always test the boundary. That's the #1 edge-case rule.

"How are these tests automated?"
"Automated" means: you run one command and ALL tests run themselves, with no manual clicking.


MANUAL testing:     open Postman → type input → click send → eyeball the result
                    (slow, you forget cases, you skip it when tired)

AUTOMATED testing:  npm test → Jest finds every *.test.ts → runs them all →
                    reports pass/fail in seconds (never forgets, never tired)
The automation comes from Jest + the test script. npm test triggers Jest, which:

Scans for all *.test.ts files
Runs every it(...) block
Checks every expect(...)
Reports results
You write the test once; it runs forever, every time, identically. That's the automation — the test is permanent, repeatable, and self-checking. Later (Phase 13), CI/CD runs npm test automatically on every git push, so broken code can't even get merged.

"What does utils mean?"
utils = utilities — a folder for small, reusable helper functions that don't belong to any specific feature.


src/
├── controllers/   → feature logic (register, login)
├── routes/        → URL mapping
├── middleware/    → auth checks
└── utils/         → small generic helpers (validation, formatting, date helpers)
                     reused across the whole service
isValidEmail isn't about auth specifically — it's a generic helper any part of the app could use. Generic helpers go in utils/. It's just an organizational folder, nothing special.

"Don't we need to test EVERY function? How do I know which to test?"
No — you do NOT test every function. This is a crucial real-world judgment. Here's how professionals decide:


TEST these:                          DON'T bother testing these:
─────────────────────────           ──────────────────────────────
✓ Business logic                     ✗ Trivial getters/setters
  (price calculation, validation)    ✗ Code that just calls a library
✓ Functions with branching           ✗ Pure config files
  (if/else, multiple outcomes)       ✗ One-line pass-throughs
✓ Anything involving money/auth      ✗ Framework glue with no logic
✓ Edge-case-prone logic
✓ Code that's broken before / risky
✓ Public API endpoints (integration)
The guiding question: "If this breaks, does something important go wrong, AND could it plausibly break?"

Examples from YOUR project:


WORTH testing:
  - placeOrder's total calculation (money! the "never trust client" logic) ✓✓✓
  - isValidEmail / password rules (validation, edge cases) ✓
  - buildNotification (maps event → text, has branching) ✓
  - the auth flow: register creates user, login returns token (critical) ✓

NOT worth testing:
  - the /health endpoint (returns a static object, no logic)
  - app.use(helmet()) (that's the library's job to test, not yours)
  - a getter that just returns a field
The principle: test where logic lives and where breakage hurts. Don't chase "100% of functions" — chase "the functions that matter." Testing trivial code wastes time and creates noise. This judgment — knowing what to test — is more valuable than knowing how to write the test.

--------------------------

LANGUAGE              TEST FRAMEWORK (the standard one)
─────────────────     ────────────────────────────────
Java               →  JUnit
JavaScript/TS      →  Jest  ← yours
Python             →  pytest
C#/.NET            →  xUnit / NUnit
Go                 →  built-in `testing` package
Ruby               →  RSpec

----------------------------

I did create 

- unit tests on new functions just to understand (validation of email and pwrd) - no DB usage
- unit tests on already existing functions (buildnotification) - no DB usage
(actually unit tests are not DB using tests)
- integrated test on - with real testing DB
-  