# Plan 017: Harden the OpenID sign-in callback (state nonce; investigate stronger redirect)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/screens/auth/OpenIdSignInScreen/ src/services/api/auth/`
> If in-scope files changed since this plan was written, compare the "Current
> state" excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M (investigation + client change; server capability decides depth)
- **Risk**: MED — must not break login against real Actual servers
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

The OpenID sign-in returns the **session token in a custom-scheme deep link**
(`actualbudget://<hostname>/openid-cb?token=…`) with no `state` nonce check.
Custom URL schemes are not exclusively claimed on iOS/Android — a co-installed
app registering the same scheme can potentially receive the callback and capture
a full session token; the missing `state` check also removes the standard
response-authenticity defense. `ASWebAuthenticationSession` (used via
`openAuthSessionAsync`) mitigates but does not eliminate this for
custom-scheme redirects. This is investigate-then-harden: the Actual server's
OpenID implementation constrains what the client can demand.

## Current state

- `src/screens/auth/OpenIdSignInScreen/hooks/useOpenIdSignIn.ts:20-41`:

```ts
      const appScheme = "actualbudget";
      const hostname = new URL(serverUrl).hostname;
      const returnUrl = `${appScheme}://${hostname}`;
      const callbackUrl = `${returnUrl}/openid-cb`;

      const authUrl = await createOpenIdLoginUrl(serverUrl, returnUrl);
      const result = await WebBrowser.openAuthSessionAsync(authUrl, callbackUrl);
      ...
      const token = Linking.parse(result.url).queryParams?.token as string | undefined;
      ...
      await finalizeAuthenticatedSession({ serverUrl, token });
```

- `src/services/api/auth/auth.api.ts:40-59` — `createOpenIdLoginUrl(serverUrl, returnUrl)`
  POSTs `{ loginMethod: "openid", returnUrl }` to `<server>/account/login` and
  returns `dto.redirectUrl ?? dto.returnUrl`.
- The server side is the self-hosted Actual sync server; its OpenID flow source
  is in the upstream repo (`actual/` sibling checkout at the workspace root —
  `ls /Users/cubancodepath/dev/actual-project/actual/packages/sync-server/` and
  grep for `openid`) — the investigation step uses it.
- Repo error convention: API-layer failures emit to the ErrorChannel bus; the
  hook swallows and resets `loading` (see the try/catch in the excerpt).

## Commands you will need

| Purpose   | Command            | Expected on success |
| --------- | ------------------ | ------------------- |
| Typecheck | `npx tsc --noEmit` | exit 0              |
| All tests | `npx vitest run`   | 0 failures          |
| Lint      | `npm run lint`     | exit 0              |

## Scope

**In scope**:

- `src/screens/auth/OpenIdSignInScreen/hooks/useOpenIdSignIn.ts`
- `src/services/api/auth/auth.api.ts` (only if the server accepts extra params)
- New pure-logic test file for the callback-URL validation
- A short findings note appended to `docs/architecture-differences.md` if the
  server constrains the fix (documenting the accepted limitation)

**Out of scope** (do NOT touch):

- The upstream `actual/` checkout — READ ONLY for investigation.
- Password sign-in and server-connect flows.
- Universal-links/app-site-association infra (record as follow-up if warranted;
  it needs domain control the self-hosted model doesn't guarantee).

## Git workflow

- Conventional commit, e.g. `fix(auth): validate openid callback with a state nonce`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Investigate the server contract (read-only)

In `/Users/cubancodepath/dev/actual-project/actual/`, locate the sync-server's
OpenID handler (`grep -rn "openid" packages/sync-server/src --include="*.ts" -l`).
Answer in writing (PR description):

1. Does the server echo arbitrary query params from `returnUrl` back onto the
   callback redirect (i.e. would `returnUrl` containing `?state=<nonce>` come
   back intact)?
2. Does it support PKCE or any response signing?
3. Is the token in the query string the only delivery mechanism?

**Verify**: the three answers are written down with `file:line` citations from
the upstream source.

### Step 2: Implement the strongest supported check

- If (1) is yes: generate a cryptographically random nonce per attempt
  (`expo-crypto`'s `randomUUID` or `getRandomBytesAsync`), append it to
  `returnUrl`/`callbackUrl`, and on callback require
  `queryParams.state === nonce` before touching `token`; mismatch → treat as
  failure (no session), log `[auth] openid state mismatch` in `__DEV__`.
- Regardless of (1): validate the callback URL's scheme AND hostname match the
  expected `actualbudget://<hostname>/openid-cb` before parsing params
  (extract a pure function `isExpectedOpenIdCallback(url, hostname, nonce?)`
  so it's unit-testable).
- If the server supports neither state echo nor PKCE (all answers no): implement
  only the URL-shape validation, and append the accepted-limitation note to
  `docs/architecture-differences.md` ("OpenID token via custom scheme —
  server-constrained; revisit when upstream adds state/PKCE").

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Tests for the pure validator

New test file colocated with the hook (pure function only, no RN rendering):
correct URL passes; wrong scheme fails; wrong hostname fails; missing/mismatched
state fails (when nonce mode active); extra params tolerated.

**Verify**: `npx vitest run src/screens/auth` → all pass.

### Step 4: Manual login check note

PR description must state: "manual verification pending — OpenID login against a
real/local server (docker-compose up) succeeds with the new validation." Do not
mark the plan DONE until the operator confirms a successful login.

## Test plan

Step 3 (5+ tests). No mocked-browser E2E — the pure validator carries the logic.

## Done criteria

- [ ] Step 1's three answers documented with upstream citations
- [ ] `queryParams?.token` is only read after URL/state validation passes (grep the hook)
- [ ] Validator tests pass; `npx vitest run` exits 0; `npx tsc --noEmit` exits 0
- [ ] If server-constrained: limitation note added to `docs/architecture-differences.md`
- [ ] `plans/README.md` status row updated (BLOCKED-on-manual-login until operator confirms)

## STOP conditions

- The upstream checkout is missing or has no sync-server OpenID code — STOP and
  ask the operator for the server version they run.
- Server echoes `state` but ALSO rejects unknown params on `returnUrl` in some
  versions — report the version split instead of shipping a flow that breaks
  older servers.

## Maintenance notes

- If upstream adds PKCE or universal-link support, upgrade this flow and delete
  the limitation note. Reviewers: confirm the nonce is generated per-attempt
  (not module-level) and never logged outside `__DEV__`.
