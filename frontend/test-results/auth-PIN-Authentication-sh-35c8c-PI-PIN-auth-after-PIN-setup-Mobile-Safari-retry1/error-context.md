# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> PIN Authentication >> should login successfully with API PIN auth after PIN setup
- Location: e2e/auth.spec.ts:334:7

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  90  |           full_name: authState.user.full_name,
  91  |           has_pin: authState.user.has_pin,
  92  |         })
  93  |       );
  94  |       if (clearRefreshToken) {
  95  |         window.localStorage.removeItem("refresh_token");
  96  |       }
  97  |     },
  98  |     {
  99  |       authState: auth,
  100 |       clearRefreshToken: options?.clearRefreshToken ?? false,
  101 |     }
  102 |   );
  103 | }
  104 | 
  105 | export async function authenticateAs(
  106 |   page: Page,
  107 |   request: APIRequestContext,
  108 |   role: Role
  109 | ): Promise<void> {
  110 |   const session = await getAuthenticatedSession(request, role);
  111 |   await seedAuthState(page, {
  112 |     accessToken: session.access_token,
  113 |     refreshToken: session.refresh_token,
  114 |     user: session.user,
  115 |   });
  116 | }
  117 | 
  118 | export async function createSessionAs(
  119 |   request: APIRequestContext,
  120 |   role: Role,
  121 |   sessionData: {
  122 |     warehouse: string;
  123 |     type?: string;
  124 |   }
  125 | ): Promise<{ id: string }> {
  126 |   const session = await getAuthenticatedSession(request, role);
  127 |   const response = await request.post(`${BACKEND_BASE_URL}/api/sessions/`, {
  128 |     data: {
  129 |       warehouse: sessionData.warehouse,
  130 |       type: sessionData.type || "STANDARD",
  131 |     },
  132 |     headers: {
  133 |       Authorization: `Bearer ${session.access_token}`,
  134 |       ...buildClientHeaders(`playwright-${role}`),
  135 |     },
  136 |   });
  137 | 
  138 |   expect(response.ok()).toBeTruthy();
  139 |   return (await response.json()) as { id: string };
  140 | }
  141 | 
  142 | export async function cleanupUserByUsername(
  143 |   request: APIRequestContext,
  144 |   username: string
  145 | ): Promise<void> {
  146 |   const adminSession = await getAuthenticatedSession(request, "admin");
  147 | 
  148 |   const headers = {
  149 |     Authorization: `Bearer ${adminSession.access_token}`,
  150 |   };
  151 | 
  152 |   const listResponse = await request.get(
  153 |     `${BACKEND_BASE_URL}/api/users?search=${encodeURIComponent(username)}&page=1&page_size=100`,
  154 |     { headers }
  155 |   );
  156 |   expect(listResponse.ok()).toBeTruthy();
  157 | 
  158 |   const listPayload = (await listResponse.json()) as {
  159 |     users?: Array<{ id: string; username: string }>;
  160 |   };
  161 | 
  162 |   const matches = (listPayload.users || []).filter((user) => user.username === username);
  163 | 
  164 |   for (const user of matches) {
  165 |     const deleteResponse = await request.delete(`${BACKEND_BASE_URL}/api/users/${user.id}`, {
  166 |       headers,
  167 |     });
  168 |     expect(deleteResponse.ok()).toBeTruthy();
  169 |   }
  170 | }
  171 | 
  172 | export async function ensurePinForRole(
  173 |   request: APIRequestContext,
  174 |   role: Role,
  175 |   pin: string
  176 | ): Promise<void> {
  177 |   const session = await getAuthenticatedSession(request, role);
  178 | 
  179 |   const response = await request.post(`${BACKEND_BASE_URL}/api/auth/pin-setup`, {
  180 |     data: {
  181 |       pin,
  182 |       confirm_pin: pin,
  183 |     },
  184 |     headers: {
  185 |       Authorization: `Bearer ${session.access_token}`,
  186 |       ...buildClientHeaders(`playwright-${role}-pin`),
  187 |     },
  188 |   });
  189 | 
> 190 |   expect(response.ok()).toBeTruthy();
      |                         ^ Error: expect(received).toBeTruthy()
  191 |   const payload = await response.json().catch(() => null);
  192 |   if (payload && typeof payload.success === "boolean") {
  193 |     expect(payload.success).toBe(true);
  194 |   }
  195 | }
  196 | 
```