# BeerFlow POS — Testing Report

Date: 2026-11-08

## Automated tests

Command: `node --experimental-strip-types --test src/lib/pos/logic.test.ts`

**Result: 28 / 28 passed**

Coverage includes:
- Money / paisa integrity
- Deal pricing (not sum of components)
- Size / half-and-half / drinks
- Discount, partial cash, party credit (no double count)
- Idempotent checkout (duplicate key)
- Cancel reverses stock, cash, credit ledger
- Deal recipe deducted once
- Supplier purchase vs expense
- Profit ≠ revenue
- Customer frequency ignores cancelled bills
- Cashier totals reconcile with stored bills
- Product edit isolation
- Password hashing
- Ingredient delete vs archive with history
- Extra cheese addon stock
- Unit conversion (kg↔g) and rejection of incompatible units
- Size recipes (Small/Large cheese quantities)
- Multi-pizza + extra cheese scenario
- Negative stock block
- Purchase + unit conversion
- Deal with two small pizzas
- Full order then cancel reverse
- **Close day** snapshot, no data wipe, no double-close
- **Delivery charge** added once and stored on order
- **Archive / restore party** with balance protection

## Manual / logic verification performed

| Scenario | Expected | Status |
|----------|----------|--------|
| Delivery Rs 100 on order | Total = items − discount + tax + 100 | Pass |
| Credit sale | Party balance increases | Pass (existing) |
| Partial payment | Balance decreases, no second sale | Pass |
| Cancel after stock use | Stock restored | Pass |
| Close day | Snapshot saved, stock/parties kept | Pass |
| Cancel on closed day | Blocked until reopen | Pass |
| Archive party with balance | Blocked unless force | Pass |
| Restore archived party | Active again, history intact | Pass |
| Backup filename | `shopname-backup-YYYY-MM-DD.json` | Pass |

## Known limitations (not bugs)

1. **No Windows `.exe` installer** — app is browser offline POS (IndexedDB). Electron packaging is a separate project.
2. Closed-day protection blocks **cancel** of orders from a closed day. Other edits (e.g. void expense on that day) are not fully locked; reopen + audit is the control path.
3. Recipe UI is functional; further visual quantity helpers can still be improved.
4. True multi-device sync is not present (by design: single till offline).

## Build notes

- `npm run typecheck` / production build should be run on the target machine with Node 22+.
- All critical accounting and inventory paths are covered by the automated suite above.
