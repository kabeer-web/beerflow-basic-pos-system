# BeerFlow POS 2.1.0

All fixes below are covered by `src/lib/pos/logic.test.ts` (43 tests).

## Business logic
- **Business day 05:00 (Asia/Karachi).** 12:00 AM to 4:59 AM belong to the previous day; the new day starts at 5 AM, so figures do not reset at midnight. Dashboard, reports, close-day and backup file names all use the same boundary.
- **No data is deleted** by day close, reports or uninstall (the installer no longer wipes app data on uninstall).
- **Unit conversion:** kg↔g, litre↔ml, dozen↔pcs. Packet/box only in their own unit (no guessed conversion).
- **Weighted average cost** with fractional precision. Orders deduct recipe qty × average cost automatically.
- **Exact purchase totals:** the total paid is what is recorded in stock and the supplier ledger (Rs 45/kg × 5 kg = Rs 225, not Rs 250).
- **Stock form:** clear errors instead of "Ingredient not found", live preview (quantity that will be stored, cost per unit, new average).
- **Customers:** identity = name + phone (both must match). No phone → never merged.
- **VIP:** after 4 completed orders; cancelled orders do not count; 👑 VIP badge in customers, orders and bills list.
- **Recipes:** size-specific recipe falls back safely; ingredient movements aggregate per order.
- **Fresh install:** completely empty till — no sample menu, deals, categories, ingredients or recipes. Owner adds everything.

## Printing (58 mm / 80 mm)
- Receipt uses the full printable width, nothing is cut on the right (amounts, "takeaway").
- Pure black, bolder text for thermal printers. BeerFlow "Powered by" mark is printed from `receipt/*.png`.
- Printer driver: set paper to the roll size, margins none, scale 100%.

## Look
- Warm restaurant / cafe palette: espresso background, terracotta primary, amber accent (replaces indigo/cyan tech look).
- Food pictures use a soft terracotta-amber glow.
- Warnings/notes and the VIP badge follow the warm cafe palette.
