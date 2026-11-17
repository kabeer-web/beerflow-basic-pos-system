# Fixed issues & added features

## Fixed / completed

1. **Delivery charges**
   - Editable delivery charge on Delivery channel
   - Included once in cart totals, order, receipt, daily summary
   - Never double-counted; cleared when channel is not delivery

2. **End of day — SAVE TODAY & CLOSE DAY**
   - Prominent UI on Reports
   - Summary: orders, sales, expected cash, delivery, credit sales, party payments, expenses, refunds
   - Actual cash count + difference
   - Permanent closed-day record (does not delete stock, parties, bills)
   - Owner can reopen with reason (audit trail)
   - Cancel of orders from a closed day is blocked until reopen

3. **Party management**
   - Archive / restore (history and balance always kept)
   - Non-zero balance archive requires force confirmation
   - Search by name **or phone**
   - Active vs archived list toggle
   - Archived parties hidden from POS credit dropdown
   - Print statement + CSV export (already present, kept)

4. **Data safety**
   - `normalizeState` for older backups (closedDays, deliveryChargePaisa, party.active)
   - Backup download filename includes shop name + date
   - Uninstall flow already required backup confirmation (kept)

5. **Accounting clarity**
   - Summary now exposes delivery charges, credit sales, party payments
   - Reports cards updated

6. **Tests**
   - 28 automated tests, all passing (including new delivery + archive + close-day cases)

## Added documentation

- `OWNER_GUIDE.md` — simple daily use, day close, stock, parties, backup, uninstall
- `TESTING_REPORT.md`
- This file

## Intentionally not converted in this delivery

- **Electron / Windows `.exe` installer**  
  Current architecture is a browser-based offline POS. Building a signed Windows installer, proper `userData` cleanup, and real install/uninstall testing requires a separate Electron packaging project and a Windows environment. The in-app uninstall already clears this app’s browser data after a backup step.

## Remaining soft items (not blockers)

- Harder lock on all mutations for closed days (beyond cancel)
- Richer visual recipe quantity builder
- Optional PDF party statement layout polish
