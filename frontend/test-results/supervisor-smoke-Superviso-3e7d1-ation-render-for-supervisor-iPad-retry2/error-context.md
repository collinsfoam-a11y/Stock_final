# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: supervisor-smoke.spec.ts >> Supervisor smoke flow >> dashboard and navigation render for supervisor
- Location: e2e/supervisor-smoke.spec.ts:8:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Keep sessions moving and catch issues early.')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText('Keep sessions moving and catch issues early.')

```

# Page snapshot

```yaml
- generic [ref=e6]:
  - generic [ref=e12]:
    - generic [ref=e15]:
      - generic:
        - generic:
          - generic: Supervisor Dashboard
          - generic: Clear daily actions for your team
      - generic [ref=e16]:
        - generic [ref=e19] [cursor=pointer]: 
        - generic [ref=e22] [cursor=pointer]: 
    - generic [ref=e26]:
      - generic [ref=e29]:
        - generic [ref=e30]:
          - generic [ref=e31]:
            - generic [ref=e32]: Supervisor overview
            - generic [ref=e33]: Keep counting on track and fix issues early.
            - generic [ref=e34]: Track progress, check team activity, and resolve count differences from one place.
          - generic [ref=e40]: Real-time monitoring
        - generic [ref=e41]:
          - generic [ref=e42]:
            - generic [ref=e43]: "0"
            - generic [ref=e44]: Open sessions
          - generic [ref=e45]:
            - generic [ref=e46]: "0"
            - generic [ref=e47]: High risk
          - generic [ref=e48]:
            - generic [ref=e49]: 0%
            - generic [ref=e50]: Completion
        - generic [ref=e51]:
          - generic [ref=e53] [cursor=pointer]:
            - generic [ref=e54]: 
            - generic [ref=e55]: Create session
          - generic [ref=e57] [cursor=pointer]:
            - generic [ref=e58]: 
            - generic [ref=e59]: Review differences
          - generic [ref=e61] [cursor=pointer]:
            - generic [ref=e62]: 
            - generic [ref=e63]: Resolve sync issues
      - generic [ref=e64]:
        - generic [ref=e65]:
          - generic [ref=e71] [cursor=pointer]:
            - generic [ref=e73]: 
            - generic [ref=e74]:
              - generic [ref=e75]: "7"
              - generic [ref=e76]: Total Sessions
          - generic [ref=e82] [cursor=pointer]:
            - generic [ref=e84]: 
            - generic [ref=e85]:
              - generic [ref=e86]: "0"
              - generic [ref=e87]: Open Sessions
        - generic [ref=e88]:
          - generic [ref=e94] [cursor=pointer]:
            - generic [ref=e96]: 
            - generic [ref=e97]:
              - generic [ref=e98]: "0"
              - generic [ref=e99]: Items Counted
          - generic [ref=e105] [cursor=pointer]:
            - generic [ref=e107]: 
            - generic [ref=e108]:
              - generic [ref=e109]: "0"
              - generic [ref=e110]: High Risk
              - generic [ref=e111]: Sessions
      - generic [ref=e115]:
        - generic [ref=e116]:
          - generic [ref=e117]: Session Completion
          - generic [ref=e118]: 0 of 7 completed
        - generic [ref=e119]:
          - img [ref=e120]
          - generic [ref=e124]: 0%
      - generic [ref=e126]:
        - generic [ref=e127]:
          - generic [ref=e128]: 
          - generic [ref=e129]: Suggested next steps
        - generic [ref=e130]:
          - generic [ref=e132] [cursor=pointer]:
            - generic [ref=e134]: 
            - generic [ref=e135]:
              - generic [ref=e136]: Move sessions to completion
              - generic [ref=e137]: Completion is below 70%. Review open sessions and clear pending items.
            - generic [ref=e138]: 
          - generic [ref=e140] [cursor=pointer]:
            - generic [ref=e142]: 
            - generic [ref=e143]:
              - generic [ref=e144]: Resolve sync issues
              - generic [ref=e145]: Fix sync issues so data stays up to date across devices.
            - generic [ref=e146]: 
          - generic [ref=e148] [cursor=pointer]:
            - generic [ref=e150]: 
            - generic [ref=e151]:
              - generic [ref=e152]: Open help guide
              - generic [ref=e153]: Need support? Use the help page for quick instructions.
            - generic [ref=e154]: 
      - generic [ref=e155]:
        - generic [ref=e156]:
          - generic [ref=e157]: Recent Activity
          - generic [ref=e160] [cursor=pointer]: View All
        - generic [ref=e162]:
          - button "Session active. stale-auth-1783356144619 - Staff Member - 0 items. Status warning. 5h ago" [ref=e163] [cursor=pointer]:
            - generic "Session active. stale-auth-1783356144619 - Staff Member - 0 items. Status warning. 5h ago" [ref=e165]:
              - generic [ref=e166]:
                - generic [ref=e168]: 
                - generic [ref=e169]:
                  - generic [ref=e171]: Session active
                  - generic [ref=e173]: stale-auth-1783356144619 - Staff Member - 0 items
                  - generic [ref=e174]: 5h ago
                - generic [ref=e175]: 
          - button "Session active. stale-auth-1783356122561 - Staff Member - 0 items. Status warning. 5h ago" [ref=e177] [cursor=pointer]:
            - generic "Session active. stale-auth-1783356122561 - Staff Member - 0 items. Status warning. 5h ago" [ref=e179]:
              - generic [ref=e180]:
                - generic [ref=e182]: 
                - generic [ref=e183]:
                  - generic [ref=e185]: Session active
                  - generic [ref=e187]: stale-auth-1783356122561 - Staff Member - 0 items
                  - generic [ref=e188]: 5h ago
                - generic [ref=e189]: 
          - button "Session active. stale-auth-1783356101549 - Staff Member - 0 items. Status warning. 5h ago" [ref=e191] [cursor=pointer]:
            - generic "Session active. stale-auth-1783356101549 - Staff Member - 0 items. Status warning. 5h ago" [ref=e193]:
              - generic [ref=e194]:
                - generic [ref=e196]: 
                - generic [ref=e197]:
                  - generic [ref=e199]: Session active
                  - generic [ref=e201]: stale-auth-1783356101549 - Staff Member - 0 items
                  - generic [ref=e202]: 5h ago
                - generic [ref=e203]: 
          - button "Session active. stale-auth-1783355963149 - Staff Member - 0 items. Status warning. 5h ago" [ref=e205] [cursor=pointer]:
            - generic "Session active. stale-auth-1783355963149 - Staff Member - 0 items. Status warning. 5h ago" [ref=e207]:
              - generic [ref=e208]:
                - generic [ref=e210]: 
                - generic [ref=e211]:
                  - generic [ref=e213]: Session active
                  - generic [ref=e215]: stale-auth-1783355963149 - Staff Member - 0 items
                  - generic [ref=e216]: 5h ago
                - generic [ref=e217]: 
          - button "Session active. stale-auth-1783355941334 - Staff Member - 0 items. Status warning. 5h ago" [ref=e219] [cursor=pointer]:
            - generic "Session active. stale-auth-1783355941334 - Staff Member - 0 items. Status warning. 5h ago" [ref=e221]:
              - generic [ref=e222]:
                - generic [ref=e224]: 
                - generic [ref=e225]:
                  - generic [ref=e227]: Session active
                  - generic [ref=e229]: stale-auth-1783355941334 - Staff Member - 0 items
                  - generic [ref=e230]: 5h ago
                - generic [ref=e231]: 
      - generic [ref=e233]:
        - generic [ref=e234]:
          - generic [ref=e235]: Recent Sessions
          - generic [ref=e238] [cursor=pointer]: View All
        - generic [ref=e243] [cursor=pointer]:
          - generic [ref=e244]:
            - generic [ref=e245]:
              - generic [ref=e246]: stale-auth-1783356144619
              - generic [ref=e247]: Staff Member
            - generic [ref=e249]: ACTIVE
          - generic [ref=e250]:
            - generic [ref=e251]:
              - generic [ref=e252]: 
              - generic [ref=e253]: 0 items
            - generic [ref=e254]:
              - generic [ref=e255]: 
              - generic [ref=e256]: "Var: 0"
        - generic [ref=e261] [cursor=pointer]:
          - generic [ref=e262]:
            - generic [ref=e263]:
              - generic [ref=e264]: stale-auth-1783356122561
              - generic [ref=e265]: Staff Member
            - generic [ref=e267]: ACTIVE
          - generic [ref=e268]:
            - generic [ref=e269]:
              - generic [ref=e270]: 
              - generic [ref=e271]: 0 items
            - generic [ref=e272]:
              - generic [ref=e273]: 
              - generic [ref=e274]: "Var: 0"
        - generic [ref=e279] [cursor=pointer]:
          - generic [ref=e280]:
            - generic [ref=e281]:
              - generic [ref=e282]: stale-auth-1783356101549
              - generic [ref=e283]: Staff Member
            - generic [ref=e285]: ACTIVE
          - generic [ref=e286]:
            - generic [ref=e287]:
              - generic [ref=e288]: 
              - generic [ref=e289]: 0 items
            - generic [ref=e290]:
              - generic [ref=e291]: 
              - generic [ref=e292]: "Var: 0"
  - button "Open navigation menu" [ref=e294] [cursor=pointer]:
    - generic [ref=e295]: 
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import {
  3  |   getAuthenticatedSession,
  4  |   seedAuthState,
  5  | } from "./helpers/auth";
  6  | 
  7  | test.describe("Supervisor smoke flow", () => {
  8  |   test("dashboard and navigation render for supervisor", async ({
  9  |     page,
  10 |     request,
  11 |   }) => {
  12 |     const session = await getAuthenticatedSession(request, "supervisor");
  13 | 
  14 |     await seedAuthState(page, {
  15 |       accessToken: session.access_token,
  16 |       refreshToken: session.refresh_token,
  17 |       user: session.user,
  18 |     });
  19 | 
  20 |     await page.goto("/");
  21 | 
  22 |     await expect(page).toHaveURL(/\/supervisor\/dashboard(?:\?.*)?$/);
  23 |     await expect(page.getByText("Supervisor Dashboard")).toBeVisible({
  24 |       timeout: 30000,
  25 |     });
  26 |     await expect(page.getByText("Supervisor overview")).toBeVisible();
  27 |     await expect(
  28 |       page.getByText("Keep sessions moving and catch issues early."),
> 29 |     ).toBeVisible();
     |       ^ Error: expect(locator).toBeVisible() failed
  30 |     await expect(page.getByText("Create session")).toBeVisible();
  31 |     await expect(page.getByText("Review variances")).toBeVisible();
  32 |     await expect(page.getByText("Recent Sessions")).toBeVisible();
  33 |     await expect(page.getByText("Recent Activity", { exact: true })).toBeVisible();
  34 | 
  35 |     const totalSessionsCard = page.getByText("Total Sessions", {
  36 |       exact: true,
  37 |     });
  38 |     await expect(totalSessionsCard).toBeVisible();
  39 |     await totalSessionsCard.click();
  40 | 
  41 |     await expect(page).toHaveURL(/\/supervisor\/sessions(?:\?.*)?$/);
  42 |     await expect(page.getByText("All Sessions")).toBeVisible();
  43 | 
  44 |     await page.goBack();
  45 |     await expect(page).toHaveURL(/\/supervisor\/dashboard(?:\?.*)?$/);
  46 |     await expect(page.getByText("Create New Session")).not.toBeVisible();
  47 |     await page.getByText("Create session", { exact: true }).click();
  48 |     await expect(page.getByText("Create New Session")).toBeVisible();
  49 |   });
  50 | 
  51 |   test("legacy bulk ops route redirects to variances", async ({
  52 |     page,
  53 |     request,
  54 |   }) => {
  55 |     const session = await getAuthenticatedSession(request, "supervisor");
  56 | 
  57 |     await seedAuthState(page, {
  58 |       accessToken: session.access_token,
  59 |       refreshToken: session.refresh_token,
  60 |       user: session.user,
  61 |     });
  62 | 
  63 |     await page.goto("/");
  64 |     await expect(page).toHaveURL(/\/supervisor\/dashboard(?:\?.*)?$/);
  65 | 
  66 |     await page.evaluate(() => {
  67 |       window.history.pushState({}, "", "/supervisor/bulk-ops");
  68 |       window.dispatchEvent(new PopStateEvent("popstate"));
  69 |     });
  70 | 
  71 |     await expect(page).toHaveURL(/\/supervisor\/variances(?:\?.*)?$/, {
  72 |       timeout: 30000,
  73 |     });
  74 |     await expect(page.getByText(/variance/i).first()).toBeVisible();
  75 |   });
  76 | });
  77 | 
```