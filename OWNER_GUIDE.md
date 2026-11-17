# BeerFlow POS — Owner Guide (Karachi)

Simple guide for the shop owner and cashier. No technical knowledge needed.

## Daily use (Cashier)

1. Open the app in the browser (Chrome recommended).
2. Login with **cashier** password.
3. **POS** screen: choose Takeaway / Dine-in / Delivery.
4. Tap deals or pizzas, pick size & flavour, add to cart.
5. For **Delivery**:
   - Enter phone + address
   - Enter **Delivery charge (Rs)** — e.g. 100
6. Discount if needed.
7. Pay (Cash / Card / Wallet) or put on a **credit party**.
8. Print or show receipt if needed.

### Credit party (khata)
- Select party in the cart before checkout for unpaid balance.
- Later: **Books → Parties** → select party → **Receive payment**.

## End of day (Owner or trusted staff)

1. Go to **Reports**.
2. Top section: **Save Today & Close Day**.
3. Check the numbers (orders, sales, expected cash, delivery, credit, expenses).
4. Count the real cash in the drawer.
5. Type the counted amount.
6. Press **SAVE TODAY & CLOSE DAY**.
7. Confirm.

**Important:** Closing the day does **not** delete any bills, stock, parties or balances. It only locks the day and saves a permanent record.

If you need to cancel a bill from a closed day: Owner must first **Reopen day** (with a reason).

## Stock & recipes (Owner)

1. **Inventory** → Add ingredients (Cheese, Sauce, Dough…) with unit (g, kg, pcs).
2. **Recipe** → link product + size to ingredient quantities.
   - Example: Large Pizza → Cheese 250 g, Sauce 100 g, Dough 1 pc.
3. When a bill is completed, stock is deducted automatically.
4. Extra cheese / toppings can also consume extra ingredient if linked on the addon.
5. Cancelled bills reverse the stock correctly.

Never let cashiers change recipes. Only the owner should.

## Parties (credit customers & suppliers)

- **Add party** with optional opening balance.
- Search by **name or phone**.
- View full ledger, running balance, print statement, export CSV.
- **Archive** when no longer used (balance should be zero; owner can force-archive).
- **Restore** archived parties anytime. History is never deleted.

## Backup (very important)

1. Settings → **Download backup**.
2. File name looks like: `beerflow-pos-backup-2026-11-08.json` (or your shop name).
3. Save on USB / WhatsApp / Google Drive every week (or every day if busy).
4. To restore: Settings → Restore backup → choose the JSON file.

## Uninstall (this device only)

Settings → **Uninstall BeerFlow POS…**

1. You will be asked to download a backup first (or confirm you accept data loss).
2. Type **UNINSTALL** to confirm.
3. All till data, pictures and cache for this app are erased from **this browser on this computer**.
4. Other files on the computer are not touched.
5. After uninstall, a fresh install starts empty. Old data does **not** come back automatically.

## What this software is

- Offline POS that runs in the browser on the till computer.
- All data stays on that computer (IndexedDB).
- No internet required for normal sales.
- It is **not** a Windows `.exe` installer package. It is designed as a browser / PWA offline app for reliability and easy backup.

## Passwords

- Change owner and cashier passwords after first install.
- Never share the owner password with cashiers.

## Support notes

- If the screen looks wrong after an update, try a hard refresh (Ctrl+Shift+R).
- Always keep recent backups.
- Closed-day records and party ledgers are your financial history — do not delete the browser profile without a backup.

Powered by BeerFlow Technologies · BeerFlow
