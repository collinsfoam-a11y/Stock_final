# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication >> Session Persistence >> should maintain session after page refresh
- Location: e2e/auth.spec.ts:308:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/start new session/i)
Expected: visible
Error: strict mode violation: getByText(/start new session/i) resolved to 2 elements:
    1) <div dir="auto" class="css-text-146c3p1">Start New Session</div> aka getByRole('button', { name: 'Start New Session' })
    2) <div dir="auto" class="css-text-146c3p1 r-fontSize-1b43r93 r-lineHeight-hbpseb r-marginTop-14gqq1x r-maxWidth-cediw7 r-textAlign-q4m81j">Tap "Start New Session" to begin scanning invento…</div> aka getByText('Tap "Start New Session" to')

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByText(/start new session/i)

```

# Page snapshot

```yaml
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
        - generic [ref=e37]: 0 sessions
    - generic [ref=e38]:
      - generic [ref=e39]:
        - generic [ref=e40]: "0"
        - generic [ref=e41]: Scanned
      - generic [ref=e43]:
        - generic [ref=e44]: "0"
        - generic [ref=e45]: Issues
  - tablist [ref=e46]:
    - tab "Active" [ref=e47] [cursor=pointer]:
      - generic [ref=e48]: Active
    - tab "History" [ref=e49] [cursor=pointer]:
      - generic [ref=e50]: History
  - generic [ref=e54]:
    - button "Start New Session" [ref=e55] [cursor=pointer]:
      - generic [ref=e56]: 
      - generic [ref=e57]: Start New Session
    - generic [ref=e58]:
      - generic [ref=e60]: 
      - generic [ref=e61]: No active sessions
      - generic [ref=e62]: Tap "Start New Session" to begin scanning inventory.
```

# Test source

```ts
  218 | 
  219 |       await page.goto("/otp-verification?identifier=staff1");
  220 |       await expect(page.getByText(/verification code/i)).toBeVisible({
  221 |         timeout: 15000,
  222 |       });
  223 |       await page.waitForFunction(
  224 |         () => window.localStorage.getItem("auth_pending_redirect") === null
  225 |       );
  226 |     });
  227 | 
  228 |     test("clears pending redirect on direct reset password route", async ({ page }) => {
  229 |       await stubApiForRedirectOnly(page);
  230 |       await page.addInitScript(() => {
  231 |         window.localStorage.setItem("auth_pending_redirect", "/staff/history?approved=1");
  232 |       });
  233 | 
  234 |       await page.goto("/reset-password?reset_token=e2e-reset-token");
  235 |       await expect(page.getByText(/^Set New Password$/i)).toBeVisible({
  236 |         timeout: 15000,
  237 |       });
  238 |       await page.waitForFunction(
  239 |         () => window.localStorage.getItem("auth_pending_redirect") === null
  240 |       );
  241 |     });
  242 | 
  243 |     test("should login successfully with valid credentials", async ({ page, request }) => {
  244 |       const session = await getAuthenticatedSession(request, "staff");
  245 |       await seedAuthState(page, {
  246 |         accessToken: session.access_token,
  247 |         refreshToken: session.refresh_token,
  248 |         user: session.user,
  249 |       });
  250 | 
  251 |       await page.goto("/login?e2e=1");
  252 |       await page.waitForURL(/\/staff\/home(?:\?.*)?$/, { timeout: 20000 });
  253 |       await expect(page.getByText(/start new session/i)).toBeVisible({
  254 |         timeout: 15000,
  255 |       });
  256 |     });
  257 | 
  258 |     test("rejects invalid credentials at auth API", async ({ request }) => {
  259 |       const response = await request.post(`${BACKEND_BASE_URL}/api/auth/login`, {
  260 |         data: {
  261 |           username: "staff1",
  262 |           password: "wrongpassword",
  263 |         },
  264 |         headers: {
  265 |           "x-device-id": "playwright-invalid-login",
  266 |         },
  267 |       });
  268 | 
  269 |       expect(response.ok()).toBeFalsy();
  270 |       const payload = await response.json().catch(() => null);
  271 |       if (payload && typeof payload.success === "boolean") {
  272 |         expect(payload.success).toBe(false);
  273 |       }
  274 |     });
  275 |   });
  276 | 
  277 |   test.describe("Logout Flow", () => {
  278 |     test.beforeEach(async ({ page, request }) => {
  279 |       const session = await getAuthenticatedSession(request, "staff");
  280 |       await seedAuthState(page, {
  281 |         accessToken: session.access_token,
  282 |         refreshToken: session.refresh_token,
  283 |         user: session.user,
  284 |       });
  285 |       await page.goto("/staff/home");
  286 |       await page.waitForURL(/\/staff\/home(?:\?.*)?$/, { timeout: 20000 });
  287 |     });
  288 | 
  289 |     test("should logout successfully", async ({ page }) => {
  290 |       await page.goto("/staff/settings");
  291 |       await page.waitForURL(/\/staff\/settings(?:\?.*)?$/, { timeout: 20000 });
  292 | 
  293 |       page.once("dialog", (dialog) => dialog.accept());
  294 |       await page
  295 |         .getByText(/^sign out$/i)
  296 |         .first()
  297 |         .click();
  298 |       await page.waitForURL(/\/welcome(?:\?.*)?$/, { timeout: 20000 });
  299 | 
  300 |       const authToken = await page.evaluate(() => window.localStorage.getItem("auth_token"));
  301 |       const authUser = await page.evaluate(() => window.localStorage.getItem("auth_user"));
  302 |       expect(authToken).toBeNull();
  303 |       expect(authUser).toBeNull();
  304 |     });
  305 |   });
  306 | 
  307 |   test.describe("Session Persistence", () => {
  308 |     test("should maintain session after page refresh", async ({ page, request }) => {
  309 |       const session = await getAuthenticatedSession(request, "staff");
  310 |       await seedAuthState(page, {
  311 |         accessToken: session.access_token,
  312 |         refreshToken: session.refresh_token,
  313 |         user: session.user,
  314 |       });
  315 | 
  316 |       await page.goto("/staff/home");
  317 |       await page.waitForURL(/\/staff\/home(?:\?.*)?$/, { timeout: 20000 });
> 318 |       await expect(page.getByText(/start new session/i)).toBeVisible({
      |                                                          ^ Error: expect(locator).toBeVisible() failed
  319 |         timeout: 15000,
  320 |       });
  321 | 
  322 |       await page.reload();
  323 |       await page.waitForURL(/\/staff\/home(?:\?.*)?$/, { timeout: 20000 });
  324 |       await expect(page.getByText(/start new session/i)).toBeVisible({
  325 |         timeout: 15000,
  326 |       });
  327 | 
  328 |       await expect(page.getByRole("button", { name: /^sign in$/i })).toHaveCount(0);
  329 |     });
  330 |   });
  331 | });
  332 | 
  333 | test.describe("PIN Authentication", () => {
  334 |   test("should login successfully with API PIN auth after PIN setup", async ({ request }) => {
  335 |     const pin = "8520";
  336 |     await ensurePinForRole(request, "staff", pin);
  337 | 
  338 |     const response = await request.post(`${BACKEND_BASE_URL}/api/auth/login-pin`, {
  339 |       data: {
  340 |         username: "staff1",
  341 |         pin,
  342 |       },
  343 |       headers: {
  344 |         "x-device-id": "playwright-pin-auth",
  345 |       },
  346 |     });
  347 | 
  348 |     expect(response.ok()).toBeTruthy();
  349 |     const payload = await response.json().catch(() => null);
  350 |     expect(payload?.success).toBe(true);
  351 |     expect(payload?.data?.access_token).toBeTruthy();
  352 |     expect(payload?.data?.user?.role).toBe("staff");
  353 |   });
  354 | });
  355 | 
```