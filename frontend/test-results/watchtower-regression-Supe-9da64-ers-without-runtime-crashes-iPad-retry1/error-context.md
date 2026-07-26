# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: watchtower-regression.spec.ts >> Supervisor watchtower regressions >> watchtower renders without runtime crashes
- Location: e2e/watchtower-regression.spec.ts:19:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Watchtower', { exact: true })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText('Watchtower', { exact: true })

```

# Page snapshot

```yaml
- generic [ref=e6]:
  - generic [ref=e7]: This screen doesn't exist.
  - link "Go to home screen!" [ref=e8] [cursor=pointer]:
    - /url: /
```

# Test source

```ts
  1  | import { expect, test, type Page } from "@playwright/test";
  2  | 
  3  | import {
  4  |   getAuthenticatedSession,
  5  |   seedAuthState,
  6  | } from "./helpers/auth";
  7  | 
  8  | function attachPageErrorCollector(page: Page) {
  9  |   const pageErrors: string[] = [];
  10 | 
  11 |   page.on("pageerror", (error) => {
  12 |     pageErrors.push(error.message);
  13 |   });
  14 | 
  15 |   return pageErrors;
  16 | }
  17 | 
  18 | test.describe("Supervisor watchtower regressions", () => {
  19 |   test("watchtower renders without runtime crashes", async ({
  20 |     page,
  21 |     request,
  22 |   }) => {
  23 |     const session = await getAuthenticatedSession(request, "supervisor");
  24 |     const pageErrors = attachPageErrorCollector(page);
  25 | 
  26 |     await seedAuthState(page, {
  27 |       accessToken: session.access_token,
  28 |       refreshToken: session.refresh_token,
  29 |       user: session.user,
  30 |     });
  31 | 
  32 |     await page.goto("/");
  33 |     await expect(page).toHaveURL(/\/supervisor\/dashboard(?:\?.*)?$/);
  34 |     await page.evaluate(() => {
  35 |       window.history.pushState({}, "", "/supervisor/watchtower");
  36 |       window.dispatchEvent(new PopStateEvent("popstate"));
  37 |     });
  38 | 
  39 |     await expect(page).toHaveURL(/\/supervisor\/watchtower(?:\?.*)?$/);
> 40 |     await expect(page.getByText("Watchtower", { exact: true })).toBeVisible();
     |                                                                 ^ Error: expect(locator).toBeVisible() failed
  41 |     await expect(page.getByText("Hourly Throughput")).toBeVisible();
  42 |     await expect(page.getByText("Recent Activity", { exact: true })).toBeVisible();
  43 | 
  44 |     expect(pageErrors).toEqual([]);
  45 |   });
  46 | 
  47 |   test("missing supervisor sessions render recovery UI instead of crashing", async ({
  48 |     page,
  49 |     request,
  50 |   }) => {
  51 |     const session = await getAuthenticatedSession(request, "supervisor");
  52 |     const pageErrors = attachPageErrorCollector(page);
  53 | 
  54 |     await seedAuthState(page, {
  55 |       accessToken: session.access_token,
  56 |       refreshToken: session.refresh_token,
  57 |       user: session.user,
  58 |     });
  59 | 
  60 |     await page.goto("/");
  61 |     await expect(page).toHaveURL(/\/supervisor\/dashboard(?:\?.*)?$/);
  62 |     await page.evaluate((missingId) => {
  63 |       window.history.pushState({}, "", `/supervisor/session/${missingId}`);
  64 |       window.dispatchEvent(new PopStateEvent("popstate"));
  65 |     }, `playwright-missing-${Date.now()}`);
  66 | 
  67 |     await expect(
  68 |       page.getByText("This session is no longer available."),
  69 |     ).toBeVisible();
  70 |     await expect(page.getByText("Back to Sessions")).toBeVisible();
  71 | 
  72 |     await page.getByText("Back to Sessions").click();
  73 |     await expect(page).toHaveURL(/\/supervisor\/sessions(?:\?.*)?$/);
  74 | 
  75 |     expect(pageErrors).toEqual([]);
  76 |   });
  77 | });
  78 | 
```