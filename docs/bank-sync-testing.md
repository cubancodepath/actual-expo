# Bank Sync — Manual Testing Guide

## Prerequisites

### 1. Local Actual Budget Server

```bash
cd ../actual && docker-compose up
```

Server should be running at `http://localhost:5006`.

### 2. GoCardless Sandbox (Optional but recommended)

GoCardless provides a sandbox bank for testing without real bank accounts.

To enable it, your server needs GoCardless credentials configured. Check if it's enabled:

```bash
curl -X POST http://localhost:5006/gocardless/status \
  -H "Content-Type: application/json" \
  -H "x-actual-token: YOUR_TOKEN" \
  -d '{}'
```

Expected response if configured: `{"status":"ok","data":{"configured":true}}`

If NOT configured, you can still test the UI flow — it will show appropriate errors.

### 3. App Running in Simulator

```bash
npm run ios
```

Log in and open a budget before testing.

---

## Test Cases

### T1: Provider Status Check (Bootstrap)

**What**: App checks GoCardless/SimpleFin availability on startup.

**Steps**:
1. Kill and relaunch the app
2. Open any account → three-dot menu → "Edit Account"
3. Scroll to "Bank Sync" section

**Expected**:
- If server has GoCardless/SimpleFin configured → "Link Bank Account" button is enabled
- If server does NOT have either configured → button is disabled
- If app is in local-only mode → button is disabled

---

### T2: Link Bank Account — GoCardless Flow (Full)

**Requires**: Server with GoCardless sandbox configured

**Steps**:
1. Open any account → Edit Account → "Link Bank Account"
2. **Provider screen**: "GoCardless" and/or "SimpleFin" shown based on server config
3. Tap "GoCardless"
4. **Country screen**: Search "United" → tap "United Kingdom"
5. **Institution screen**: Search "DEMO" → tap "DEMO bank" (`SANDBOXFINANCE_SFIN0000`)
6. **Consent screen**: Tap "Open Bank Authorization"
7. Browser opens GoCardless sandbox page → complete the flow → return to app
8. Tap "Check Status" if needed
9. **Accounts screen**: Bank accounts listed → tap one
10. **Link Account screen**: Select a local account → tap "Confirm"

**Expected**:
- Navigation flows through all screens without crashes
- After linking, you're dismissed back to account settings
- The account now shows "GoCardless" in the Bank Sync section with "Sync Now" and "Unlink" buttons

---

### T3: Link Bank Account — UI Without Server Config

**Steps**:
1. With a server that does NOT have GoCardless configured
2. Open account → Edit Account → "Link Bank Account"

**Expected**:
- Button should be disabled (grayed out)
- No crash, no navigation

---

### T4: Linked Account — Visual Indicator

**Steps**:
1. After linking an account (T2)
2. Go to the Accounts tab (main accounts list)

**Expected**:
- Linked account shows a small link icon (🔗) to the left of the account name
- Non-linked accounts do NOT show the icon

---

### T5: Manual Sync

**Steps**:
1. Open a linked account's transaction list
2. Tap the three-dot menu (ellipsis) in the toolbar
3. Tap "Sync Now"

**Expected**:
- Menu shows "Sync Now" option (only for linked accounts)
- While syncing: shows "Syncing..."
- After sync: transactions refresh, new bank transactions appear
- Go to Edit Account → Bank Sync section shows "Last synced: [date]" and result summary

---

### T6: Auto-Sync on Foreground

**Steps**:
1. Have a linked account
2. Switch to another app (home screen or another app)
3. Return to the Actual Budget app

**Expected**:
- CRDT sync fires first (visible in Metro logs as `[fullSync]`)
- Bank sync follows automatically
- No visible UI interruption — sync happens in background

---

### T7: Unlink Account

**Steps**:
1. Open a linked account → Edit Account
2. Tap "Unlink Bank Account"
3. Confirm in the alert dialog

**Expected**:
- Bank sync section resets to just "Link Bank Account"
- Link icon disappears from accounts list
- Existing transactions are NOT deleted
- "Sync Now" menu item disappears from account detail toolbar

---

### T8: SimpleFin Flow

**Requires**: Server with SimpleFin token configured

**Steps**:
1. Open account → Edit Account → "Link Bank Account"
2. Tap "SimpleFin"
3. **SimpleFin Accounts screen**: Shows available accounts with names, org, and balances
4. Tap an account
5. **Link Account screen**: Select local account → Confirm

**Expected**:
- Accounts load from server
- Linking works the same as GoCardless
- Account shows "SimpleFin" in Bank Sync section

---

### T9: Error Handling

**Steps**:
1. Turn off Wi-Fi / disconnect server
2. Try to sync a linked account (Edit Account → "Sync Now")

**Expected**:
- Error banner appears with network error message
- App does not crash
- Retrying after reconnecting works

**Also test**:
- Kill the docker server while on institution screen → should show error with retry
- Link an account, then delete the bank connection on server → sync should show "expired" error

---

### T10: Reconciliation Accuracy

**Steps**:
1. Manually add a transaction: amount -$42.50, date today, payee "Test Store"
2. Link the account to a bank that returns a transaction with the same amount and similar date
3. Trigger sync

**Expected**:
- The bank transaction should MATCH the manual one (fuzzy match by amount + date)
- The manual transaction gets `financial_id` set (visible in raw data)
- No duplicate created
- Manual payee/category preserved (bank data doesn't overwrite)

---

## Checking State via SQLite

If you need to inspect the database directly:

```sql
-- Check account bank sync fields
SELECT id, name, account_sync_source, bank, account_id, last_sync
FROM accounts WHERE tombstone = 0;

-- Check banks table
SELECT * FROM banks WHERE tombstone = 0;

-- Check imported transactions
SELECT id, date, amount, financial_id, imported_description, cleared
FROM transactions
WHERE financial_id IS NOT NULL AND tombstone = 0
ORDER BY date DESC;
```

---

## Metro Console Keywords

Watch for these in the Metro bundler console:

| Keyword | Meaning |
|---------|---------|
| `[fullSync]` | CRDT sync activity |
| `PostError` | Server API call failed |
| `BankSyncError` | Bank provider returned error (expired, rate-limited) |
| `[sendMessages]` | CRDT messages being applied (transactions, accounts) |

---

## Known Limitations

- **No real bank accounts tested**: Only sandbox banks can be tested in development
- **GoCardless sandbox**: The DEMO bank (`SANDBOXFINANCE_SFIN0000`) returns mock data
- **SimpleFin**: Requires a real SimpleFin access token on the server — no sandbox available
- **Pending transactions**: Not yet managed separately (all imported into main transactions table)
- **Custom field mappings**: Not yet exposed in UI (server-side preference per account)
