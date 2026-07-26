# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: core-flow.spec.ts >> Core User Flow >> Login -> Create Session -> Scan -> Verify -> Logout
- Location: e2e/core-flow.spec.ts:14:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
=========================== logs ===========================
waiting for navigation to "**/staff/item-detail?**" until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e12]:
  - generic [ref=e13]:
    - generic [ref=e15] [cursor=pointer]: 
    - generic [ref=e16]: Scan Barcode
  - generic [ref=e17]:
    - generic [ref=e24]: Align barcode within frame
    - generic [ref=e25]: Scanner closes after 30s of inactivity
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | import {
  3   |   createSessionAs,
  4   |   getAuthenticatedSession,
  5   |   seedAuthState,
  6   | } from "./helpers/auth";
  7   | 
  8   | const INVALID_ACCESS_TOKEN =
  9   |   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  10  |   "eyJzdWIiOiJzdGFmZjEiLCJyb2xlIjoic3RhZmYiLCJleHAiOjQxMDI0NDQ4MDB9." +
  11  |   "invalid-signature";
  12  | 
  13  | test.describe("Core User Flow", () => {
  14  |   test("Login -> Create Session -> Scan -> Verify -> Logout", async ({
  15  |     page,
  16  |   }) => {
  17  |     test.setTimeout(300000); // 5 minutes
  18  | 
  19  |     // Debug Network & Errors
  20  |     page.on("requestfailed", (request) =>
  21  |       console.log(
  22  |         `Request failed: ${request.url()} ${request.failure()?.errorText}`,
  23  |       ),
  24  |     );
  25  |     page.on("pageerror", (exception) =>
  26  |       console.log(`Page Error: ${exception}`),
  27  |     );
  28  |     page.on("console", (msg) => console.log(`Browser console: ${msg.text()}`));
  29  |     page.on("dialog", async (dialog) => {
  30  |       await dialog.accept();
  31  |     });
  32  | 
  33  |     // Mock Permissions API to prevent Safari errors with Expo Camera
  34  |     await page.addInitScript(() => {
  35  |       if (navigator.permissions) {
  36  |         // @ts-ignore
  37  |         navigator.permissions.query = async () => ({
  38  |           state: "granted",
  39  |           onchange: null,
  40  |           addEventListener: () => {},
  41  |           removeEventListener: () => {},
  42  |           dispatchEvent: () => false,
  43  |         });
  44  |       }
  45  |     });
  46  | 
  47  |     // 1. Login
  48  |     await page.goto("/login?e2e=1");
  49  |     await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  50  | 
  51  |     await page.getByPlaceholder("Enter your username").fill("staff1");
  52  |     await page.getByPlaceholder("Enter your password").fill("staff123");
  53  |     await page.getByRole("button", { name: "Sign In" }).click();
  54  | 
  55  |     await page.waitForURL("**/staff/home**", { timeout: 30000 });
  56  |     await expect(
  57  |       page.getByText("Start New Session", { exact: true }),
  58  |     ).toBeVisible();
  59  | 
  60  |     // 2. Create Session
  61  |     await page.getByText("Start New Session", { exact: true }).click();
  62  |     await expect(page.getByText("New Session", { exact: true })).toBeVisible();
  63  | 
  64  |     await page.getByText("Showroom", { exact: true }).click();
  65  |     await page.getByText("Ground Floor", { exact: true }).click();
  66  |     await page.getByPlaceholder("e.g. A-123").fill("A-123");
  67  |     await page.getByText("Start Session", { exact: true }).click();
  68  | 
  69  |     await page.waitForURL("**/staff/scan?sessionId=**", { timeout: 30000 });
  70  |     await expect(
  71  |       page.getByPlaceholder("Enter barcode or item code..."),
  72  |     ).toBeVisible();
  73  |     await expect(page.getByRole("button", { name: "Finish Rack" })).toBeVisible();
  74  | 
  75  |     // 3. Search/Lookup item
  76  |     await page.getByPlaceholder("Enter barcode or item code...").fill("513456");
  77  |     await page.getByTestId("scan-search-submit").click();
  78  | 
> 79  |     await page.waitForURL("**/staff/item-detail?**", { timeout: 30000 });
      |                ^ TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
  80  |     await expect(page.getByText("Verify Item", { exact: true })).toBeVisible();
  81  |     await expect(page.getByText("Counted Quantity")).toBeVisible();
  82  | 
  83  |     // 4. Enter quantity
  84  |     const qtyInput = page.locator(
  85  |       'xpath=//*[contains(normalize-space(.),"Counted Quantity")]/following::input[@placeholder="0"][1]',
  86  |     );
  87  |     await expect(qtyInput).toBeVisible();
  88  |     await qtyInput.fill("10");
  89  |     await page
  90  |       .getByPlaceholder("Variance reason (if any)")
  91  |       .fill("E2E variance");
  92  | 
  93  |     // 5. Save & Verify (wait for countdown submit to finish and navigate back)
  94  |     await page.getByRole("button", { name: "Save & Verify" }).click();
  95  |     await expect(page.getByText(/Undo \(\d+s\)/)).toBeVisible({
  96  |       timeout: 5000,
  97  |     });
  98  |     await page.waitForURL("**/staff/scan?sessionId=**", { timeout: 60000 });
  99  |     await expect(
  100 |       page.getByPlaceholder("Enter barcode or item code..."),
  101 |     ).toBeVisible();
  102 | 
  103 |     // 6. Logout via Settings page
  104 |     await page.goto("/staff/settings");
  105 |     await expect(page.getByText("Sign Out", { exact: true })).toBeVisible();
  106 |     await page.getByText("Sign Out", { exact: true }).click();
  107 |     await page.waitForURL("**/welcome", { timeout: 30000 });
  108 |     await expect(page.getByText("Lavanya E-Mart")).toBeVisible();
  109 | 
  110 |     console.log("Flow Completed Successfully");
  111 |   });
  112 | 
  113 |   test("stale auth on scan redirects cleanly without retry storms", async ({
  114 |     page,
  115 |     request,
  116 |   }) => {
  117 |     const session = await getAuthenticatedSession(request, "staff");
  118 |     const createdSession = await createSessionAs(request, "staff", {
  119 |       warehouse: `stale-auth-${Date.now()}`,
  120 |     });
  121 | 
  122 |     const statsResponses: string[] = [];
  123 |     const refreshResponses: string[] = [];
  124 |     const websocketAttempts: string[] = [];
  125 | 
  126 |     page.on("response", (response) => {
  127 |       const url = response.url();
  128 |       if (url.includes(`/api/sessions/${createdSession.id}/stats`)) {
  129 |         statsResponses.push(`${response.status()} ${url}`);
  130 |       }
  131 |       if (url.includes("/api/auth/refresh")) {
  132 |         refreshResponses.push(`${response.status()} ${url}`);
  133 |       }
  134 |     });
  135 | 
  136 |     page.on("websocket", (websocket) => {
  137 |       if (websocket.url().includes("/ws/updates")) {
  138 |         websocketAttempts.push(websocket.url());
  139 |       }
  140 |     });
  141 | 
  142 |     await seedAuthState(
  143 |       page,
  144 |       {
  145 |         accessToken: INVALID_ACCESS_TOKEN,
  146 |         user: session.user,
  147 |       },
  148 |       { clearRefreshToken: true },
  149 |     );
  150 | 
  151 |     await page.goto(`/staff/scan?sessionId=${encodeURIComponent(createdSession.id)}`);
  152 | 
  153 |     await page.waitForURL(/\/welcome(?:\?.*)?$/, { timeout: 20000 });
  154 |     await page.waitForTimeout(6000);
  155 | 
  156 |     expect(statsResponses.length).toBeLessThanOrEqual(2);
  157 |     expect(refreshResponses.length).toBeLessThanOrEqual(1);
  158 |     expect(websocketAttempts.length).toBeLessThanOrEqual(1);
  159 |   });
  160 | });
  161 | 
```