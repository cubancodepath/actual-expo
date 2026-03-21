# TestFlight — External Testing Configuration

Referencia para llenar el formulario de Test Information en App Store Connect.

---

## Beta App Description (4,000 chars)

```
Actual Budget Mobile is a native iOS client for Actual Budget — the open-source, self-hosted budgeting platform. Connect to your own server, manage zero-based budgets, enter transactions, and explore financial reports.

What to test:
- Budget tab: create categories, assign money, check progress bars
- Spending tab: enter transactions, use calculator toolbar, auto-category rules
- Accounts tab: check balances, reconcile, swipe to clear transactions
- Reports tab: Net Worth, Cash Flow, Spending by Category, Savings Rate, Money Buffer
- Privacy mode: tap the ellipsis menu → Hide Amounts
- Sync: app should sync automatically when returning from background

Please report any crashes, visual glitches, or confusing interactions via TestFlight feedback or GitHub Issues.
```

---

## Feedback Email

```
bjvalmaseda.g@gmail.com
```

---

## Contact Information

```
First Name: Barbaro
Last Name:  Valmaseda
Phone:      [tu teléfono]
Email:      bjvalmaseda.g@gmail.com
```

---

## Sign-In Information

```
Sign-in required: YES
User Name: https://actualserver.cubancodepath.com
Password:  appleapp
```

> El campo "User Name" es la Server URL. La app no usa usuario/password tradicional — usa URL del servidor + password del budget file.

---

## Waitlist Testers

Los emails del waitlist se consultan desde Cloudflare D1:

```bash
cd /Users/cubancodepath/dev/actual-project/actual-landing
npx wrangler d1 execute actual-waitlist --remote --command "SELECT email FROM waitlist WHERE testflight_invited = 0 ORDER BY created_at DESC;"
```

Después de invitarlos, marcarlos:

```bash
npx wrangler d1 execute actual-waitlist --remote --command "UPDATE waitlist SET testflight_invited = 1 WHERE testflight_invited = 0;"
```

---

## Export Compliance

- **Does your app use encryption?**: Yes
- **Does your app qualify for any of the exemptions?**: Yes
- *(AES-256-GCM para sync, HTTPS para network — ya configurado con `ITSAppUsesNonExemptEncryption: false` en app.config.ts)*
