# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings-notifications-smoke.spec.ts >> settings and notifications visual smoke >> notifications staff 390
- Location: e2e/settings-notifications-smoke.spec.ts:319:9

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "[warning] props.pointerEvents is deprecated. Use style.pointerEvents",
+ ]
```

# Page snapshot

```yaml
- generic [ref=e6]:
  - generic [ref=e8]:
    - button "Go back" [ref=e10] [cursor=pointer]:
      - generic [ref=e11]: 
    - generic [ref=e13]:
      - generic [ref=e14]: Notifications
      - generic [ref=e15]: All caught up
    - button "Open settings" [ref=e17] [cursor=pointer]:
      - generic [ref=e18]: 
  - generic [ref=e22]:
    - generic [ref=e23]:
      - generic [ref=e24]: "0"
      - generic [ref=e25]: Total
    - generic [ref=e27]:
      - generic [ref=e28]: "0"
      - generic [ref=e29]: Unread
    - generic [ref=e31]:
      - generic [ref=e32]: "0"
      - generic [ref=e33]: Read
  - generic [ref=e34]:
    - button "All" [ref=e35] [cursor=pointer]:
      - generic [ref=e36]: All
    - button "Unread (0)" [ref=e37] [cursor=pointer]:
      - generic [ref=e38]: Unread (0)
  - generic [ref=e42]:
    - generic [ref=e43]: 
    - generic [ref=e44]: No Notifications
    - generic [ref=e45]: Recount, approval, and session alerts will appear here.
```

# Test source

```ts
  257 | }
  258 | 
  259 | async function seedScenarioAuth(
  260 |   page: Page,
  261 |   request: Parameters<typeof getAuthenticatedSession>[0],
  262 |   role: Role
  263 | ) {
  264 |   if (USE_MOCK_AUTH) {
  265 |     await installMockApi(page, role);
  266 |     await seedAuthState(page, buildMockAuth(role));
  267 |     return;
  268 |   }
  269 | 
  270 |   const session = await getAuthenticatedSession(request, role);
  271 |   await seedAuthState(page, {
  272 |     accessToken: session.access_token,
  273 |     refreshToken: session.refresh_token,
  274 |     user: session.user,
  275 |   });
  276 | }
  277 | 
  278 | async function collectLayoutIssues(page: Page) {
  279 |   return page.evaluate(() => {
  280 |     const viewportWidth = window.innerWidth;
  281 |     const documentScrollWidth = Math.max(
  282 |       document.documentElement.scrollWidth,
  283 |       document.body.scrollWidth
  284 |     );
  285 |     const overflowNodes = Array.from(document.querySelectorAll("body *"))
  286 |       .map((node) => {
  287 |         const rect = node.getBoundingClientRect();
  288 |         const style = window.getComputedStyle(node);
  289 |         return {
  290 |           tag: node.tagName.toLowerCase(),
  291 |           text: (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
  292 |           left: Math.round(rect.left),
  293 |           right: Math.round(rect.right),
  294 |           width: Math.round(rect.width),
  295 |           height: Math.round(rect.height),
  296 |           position: style.position,
  297 |         };
  298 |       })
  299 |       .filter((entry) => entry.width > 1 && entry.height > 1)
  300 |       .filter((entry) => entry.left < -2 || entry.right > viewportWidth + 2)
  301 |       .slice(0, 10);
  302 | 
  303 |     return {
  304 |       documentScrollWidth,
  305 |       hasHorizontalScroll: documentScrollWidth > viewportWidth + 2,
  306 |       overflowNodes,
  307 |       viewportWidth,
  308 |     };
  309 |   });
  310 | }
  311 | 
  312 | test.describe("settings and notifications visual smoke", () => {
  313 |   test.skip(
  314 |     ({ browserName }) => browserName !== "chromium",
  315 |     "Layout smoke runs in Chromium with explicit viewport sizes."
  316 |   );
  317 | 
  318 |   for (const scenario of SCENARIOS) {
  319 |     test(scenario.name, async ({ page, request }, testInfo) => {
  320 |       const consoleMessages: string[] = [];
  321 |       const requestFailures: string[] = [];
  322 |       const pageErrors: string[] = [];
  323 | 
  324 |       page.on("console", (message) => {
  325 |         if (message.type() === "warning" || message.type() === "error") {
  326 |           const text = `[${message.type()}] ${message.text()}`;
  327 |           if (!shouldIgnoreConsoleMessage(text)) {
  328 |             consoleMessages.push(text);
  329 |           }
  330 |         }
  331 |       });
  332 |       page.on("requestfailed", (request) => {
  333 |         requestFailures.push(`${request.failure()?.errorText ?? "failed"} ${request.url()}`);
  334 |       });
  335 |       page.on("pageerror", (error) => {
  336 |         pageErrors.push(error.message);
  337 |       });
  338 | 
  339 |       await seedScenarioAuth(page, request, scenario.role);
  340 | 
  341 |       await page.setViewportSize({ width: scenario.width, height: scenario.height });
  342 |       await page.goto(scenario.path);
  343 |       await page.waitForLoadState("domcontentloaded");
  344 |       await expect(page.locator("#root")).toBeVisible({ timeout: 10000 });
  345 |       await expect(page.getByText(scenario.heading).first()).toBeVisible({ timeout: 15000 });
  346 |       await page.waitForTimeout(700);
  347 | 
  348 |       const layout = await collectLayoutIssues(page);
  349 |       const screenshot = await page.screenshot({ fullPage: true });
  350 |       await testInfo.attach(`${scenario.name}.png`, {
  351 |         body: screenshot,
  352 |         contentType: "image/png",
  353 |       });
  354 | 
  355 |       expect(layout.hasHorizontalScroll, JSON.stringify(layout, null, 2)).toBe(false);
  356 |       expect(layout.overflowNodes, JSON.stringify(layout, null, 2)).toEqual([]);
> 357 |       expect(consoleMessages).toEqual([]);
      |                               ^ Error: expect(received).toEqual(expected) // deep equality
  358 |       expect(requestFailures).toEqual([]);
  359 |       expect(pageErrors).toEqual([]);
  360 |     });
  361 |   }
  362 | });
  363 | 
```