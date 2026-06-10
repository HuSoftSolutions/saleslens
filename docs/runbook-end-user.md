# End-User Runbook — Connecting SalesLens to Clover

For a business owner/manager who has signed in to SalesLens and wants insights
from their Clover POS. Each physical location is a separate Clover account
("merchant"), and you connect each one.

---

## 1. Sign in
- Go to your SalesLens URL and sign in (email + password). First sign-in creates
  your organization automatically.

## 2. Connect your first location
1. Go to **Settings → Locations**.
2. Click **Connect with Clover (OAuth)**.
3. You'll be taken to Clover. **Log in with that location's Clover account** and
   approve the requested access (read-only: Merchant, Orders, Payments, Inventory).
4. You'll return to SalesLens and see the location listed with an **Active** badge.

> Multi-location? Repeat **Connect with Clover** once per location. Each
> authorization **adds** a location — they don't overwrite each other.

## 3. Pull in your data
- On each location row, click **Sync**. SalesLens imports that location's recent
  sales (orders, payments, items, categories). This takes a few seconds to a
  couple of minutes depending on volume.
- Re-click **Sync** anytime to refresh with the latest data. (There's no
  automatic schedule yet — sync when you want fresh numbers.)

## 4. Ask questions
- Go to **Chat** and ask in plain English:
  - *"What were my total sales this week?"*
  - *"Top selling items today?"*
  - *"How does this week compare to last week?"*
  - *"Which location did the most sales?"* (if you have several)
  - *"When are we busiest?"* / *"How's simulator/bay revenue vs food & drink?"*
- Use the **location selector** (top of Chat) to focus on one location, or leave
  it on **All locations**.
- Answers come back as text, tables, and charts. Past conversations are saved in
  the sidebar.

## 5. Account settings
- **Settings → Usage limits** (owners/admins): set per-user question limits.
- **Settings → Locations**: **Sync**, or **Disconnect** (trash icon) a location.

---

## Troubleshooting
| Symptom | What to do |
|---|---|
| A location shows **Reconnect / error** | Its Clover authorization expired or was revoked. Click **Connect with Clover** again for that location. |
| Chat says "no data" for a recent day | Click **Sync** on the location to pull the latest, then ask again. |
| "Daily question limit reached" | You hit your usage limit; an owner can raise it in Settings → Usage limits. |
| Numbers look low/old | Click **Sync** — data is as fresh as your last sync. |

## What SalesLens can and can't see
- **Read-only.** SalesLens never changes anything in Clover.
- It reads sales/orders/payments/items. It does **not** access customer PII,
  payroll, or bank details.
- Your data is private to your organization — other SalesLens customers cannot
  see it.
