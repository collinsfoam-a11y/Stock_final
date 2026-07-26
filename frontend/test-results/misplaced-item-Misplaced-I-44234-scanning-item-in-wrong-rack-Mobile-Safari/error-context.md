# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: misplaced-item.spec.ts >> Misplaced Item Verification >> should show warning when scanning item in wrong rack
- Location: e2e/misplaced-item.spec.ts:5:7

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
  1  | import { test, expect } from "@playwright/test";
  2  | import { authenticateAs } from "./helpers/auth";
  3  | 
  4  | test.describe("Misplaced Item Verification", () => {
  5  |   test("should show warning when scanning item in wrong rack", async ({ page, request }) => {
  6  |     // 1. Seed authenticated staff session
  7  |     await authenticateAs(page, request, "staff");
  8  |     await page.goto("/staff/home?e2e=1");
  9  | 
  10 |     // Verify Dashboard
  11 |     await page.waitForURL("**/staff/home**", { timeout: 30000 });
  12 |     await expect(page.getByText("Start New Session", { exact: true })).toBeVisible();
  13 | 
  14 |     // 2. Start Session in Rack "B1" (Item is in A1)
  15 |     await page.getByText("Start New Session", { exact: true }).click();
  16 |     await page.getByText("Showroom", { exact: true }).click();
> 17 |     await page.getByText("Ground Floor", { exact: true }).click();
     |                                                           ^ Error: locator.click: Error: strict mode violation: getByText('Ground Floor', { exact: true }) resolved to 2 elements:
  18 |     await page.getByPlaceholder("e.g. A-123").fill("B1");
  19 |     await page.getByText("Start Session", { exact: true }).click();
  20 | 
  21 |     // Verify Scan Screen
  22 |     await expect(page.getByPlaceholder("Enter barcode or item code...")).toBeVisible();
  23 | 
  24 |     // 3. Scan Item 510005
  25 |     await page.getByPlaceholder("Enter barcode or item code...").fill("510005");
  26 |     await page.getByTestId("scan-search-submit").click();
  27 | 
  28 |     // 4. Verify Item Detail and Warning
  29 |     await page.waitForURL("**/staff/item-detail**", { timeout: 15000 });
  30 |     await expect(page.getByText("Active Barcode", { exact: true })).toBeVisible({ timeout: 10000 });
  31 | 
  32 |     // Expect misplaced warning when ERP is online, or offline fallback warning otherwise
  33 |     const statusWarning = page
  34 |       .getByText("MISPLACED ITEM", { exact: true })
  35 |       .or(page.getByText("ERP Offline", { exact: true }));
  36 |     await expect(statusWarning.first()).toBeVisible({ timeout: 5000 });
  37 | 
  38 |     console.log("Test Passed: Misplaced warning visible");
  39 |   });
  40 | });
  41 | 
```