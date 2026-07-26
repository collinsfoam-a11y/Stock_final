# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: core-flow.spec.ts >> Core User Flow >> Login -> Create Session -> Scan -> Verify -> Logout
- Location: e2e/core-flow.spec.ts:14:7

# Error details

```
Error: locator.click: Error: strict mode violation: getByText('Ground Floor', { exact: true }) resolved to 2 elements:
    1) <div dir="auto" class="css-text-146c3p1 r-maxWidth-dnmrzs r-overflow-1udh08x r-textOverflow-1udbk01 r-whiteSpace-3s2u2q r-wordWrap-1iln25a r-fontSize-1enofrn r-letterSpacing-oxtfae r-marginTop-1bymd8e">Ground Floor</div> aka getByRole('button', { name: ' A-123 Ground Floor ACTIVE 0' })
    2) <div dir="auto" class="css-text-146c3p1 r-fontSize-1b43r93 r-fontWeight-1kfrs79">Ground Floor</div> aka getByRole('radio', { name: ' Ground Floor' })

Call log:
  - waiting for getByText('Ground Floor', { exact: true })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e10]:
    - generic [ref=e12]:
      - generic [ref=e20]:
        - generic [ref=e21]: Stock Verify
        - generic [ref=e22]: Staff Member
      - generic [ref=e24]:
        - button "Notifications" [ref=e25] [cursor=pointer]:
          - generic [ref=e26]: 
        - button "Settings" [ref=e27] [cursor=pointer]:
          - generic [ref=e28]: 
        - button "Sign out" [ref=e29] [cursor=pointer]:
          - generic [ref=e30]: 
    - generic [ref=e31]:
      - generic [ref=e32]:
        - generic [ref=e34]: 
        - generic [ref=e35]:
          - generic [ref=e36]: Active Workload
          - generic [ref=e37]: 4 sessions
      - generic [ref=e38]:
        - generic [ref=e39]:
          - generic [ref=e40]: "0"
          - generic [ref=e41]: Scanned
        - generic [ref=e43]:
          - generic [ref=e44]: "0"
          - generic [ref=e45]: Issues
    - tablist [ref=e46]:
      - tab "Active 4" [ref=e47] [cursor=pointer]:
        - generic [ref=e48]: Active
        - generic [ref=e50]: "4"
      - tab "History" [ref=e51] [cursor=pointer]:
        - generic [ref=e52]: History
    - generic [ref=e56]:
      - button "Start New Session" [ref=e57] [cursor=pointer]:
        - generic [ref=e58]: 
        - generic [ref=e59]: Start New Session
      - button " stale-auth-1783355963149 ACTIVE 0 Scanned 0 Issues 5h ago Resume ›" [ref=e60] [cursor=pointer]:
        - generic [ref=e62]:
          - generic [ref=e63]:
            - generic [ref=e65]: 
            - generic [ref=e67]: stale-auth-1783355963149
            - generic [ref=e70]: ACTIVE
          - generic [ref=e71]:
            - generic [ref=e72]:
              - generic [ref=e73]: "0"
              - generic [ref=e74]: Scanned
            - generic [ref=e76]:
              - generic [ref=e77]: "0"
              - generic [ref=e78]: Issues
            - generic [ref=e80]:
              - generic [ref=e81]: 5h ago
              - generic [ref=e82]: Resume ›
      - button " stale-auth-1783355941334 ACTIVE 0 Scanned 0 Issues 5h ago Resume ›" [ref=e83] [cursor=pointer]:
        - generic [ref=e85]:
          - generic [ref=e86]:
            - generic [ref=e88]: 
            - generic [ref=e90]: stale-auth-1783355941334
            - generic [ref=e93]: ACTIVE
          - generic [ref=e94]:
            - generic [ref=e95]:
              - generic [ref=e96]: "0"
              - generic [ref=e97]: Scanned
            - generic [ref=e99]:
              - generic [ref=e100]: "0"
              - generic [ref=e101]: Issues
            - generic [ref=e103]:
              - generic [ref=e104]: 5h ago
              - generic [ref=e105]: Resume ›
      - button " stale-auth-1783355920361 ACTIVE 0 Scanned 0 Issues 5h ago Resume ›" [ref=e106] [cursor=pointer]:
        - generic [ref=e108]:
          - generic [ref=e109]:
            - generic [ref=e111]: 
            - generic [ref=e113]: stale-auth-1783355920361
            - generic [ref=e116]: ACTIVE
          - generic [ref=e117]:
            - generic [ref=e118]:
              - generic [ref=e119]: "0"
              - generic [ref=e120]: Scanned
            - generic [ref=e122]:
              - generic [ref=e123]: "0"
              - generic [ref=e124]: Issues
            - generic [ref=e126]:
              - generic [ref=e127]: 5h ago
              - generic [ref=e128]: Resume ›
      - button " A-123 Ground Floor ACTIVE 0 Scanned 0 Issues 5h ago Resume ›" [ref=e129] [cursor=pointer]:
        - generic [ref=e131]:
          - generic [ref=e132]:
            - generic [ref=e134]: 
            - generic [ref=e135]:
              - generic [ref=e136]: A-123
              - generic [ref=e137]: Ground Floor
            - generic [ref=e140]: ACTIVE
          - generic [ref=e141]:
            - generic [ref=e142]:
              - generic [ref=e143]: "0"
              - generic [ref=e144]: Scanned
            - generic [ref=e146]:
              - generic [ref=e147]: "0"
              - generic [ref=e148]: Issues
            - generic [ref=e150]:
              - generic [ref=e151]: 5h ago
              - generic [ref=e152]: Resume ›
  - dialog [ref=e154]:
    - generic [ref=e156]:
      - generic [ref=e157]:
        - generic [ref=e159]: 
        - generic [ref=e160]: New Session
        - button "Close" [ref=e161] [cursor=pointer]:
          - generic [ref=e162]: 
      - generic [ref=e163]:
        - generic [ref=e164]:
          - generic [ref=e166]: 
          - generic [ref=e167]: Location
        - generic [ref=e168]:
          - generic [ref=e170]: "2"
          - generic [ref=e171]: Floor
        - generic [ref=e172]:
          - generic [ref=e174]: "3"
          - generic [ref=e175]: Rack
      - generic [ref=e177]:
        - generic [ref=e178]: Select Location
        - generic [ref=e179]:
          - radio " Showroom" [active] [ref=e180] [cursor=pointer]:
            - generic [ref=e181]: 
            - generic [ref=e182]: Showroom
          - radio " Godown" [ref=e183] [cursor=pointer]:
            - generic [ref=e184]: 
            - generic [ref=e185]: Godown
        - generic [ref=e186]:
          - generic [ref=e187]: Select Floor / Area
          - generic [ref=e188]:
            - radio " Ground Floor" [ref=e189] [cursor=pointer]:
              - generic [ref=e190]: 
              - generic [ref=e191]: Ground Floor
            - radio " First Floor" [ref=e192] [cursor=pointer]:
              - generic [ref=e193]: 
              - generic [ref=e194]: First Floor
            - radio " Second Floor" [ref=e195] [cursor=pointer]:
              - generic [ref=e196]: 
              - generic [ref=e197]: Second Floor
      - generic [ref=e198]:
        - button "Start Session" [disabled]:
          - generic [ref=e199]: 
          - generic [ref=e200]: Start Session
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
> 65  |     await page.getByText("Ground Floor", { exact: true }).click();
      |                                                           ^ Error: locator.click: Error: strict mode violation: getByText('Ground Floor', { exact: true }) resolved to 2 elements:
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
  79  |     await page.waitForURL("**/staff/item-detail?**", { timeout: 30000 });
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