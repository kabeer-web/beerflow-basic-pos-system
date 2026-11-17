# BeerFlow POS

Offline point-of-sale for restaurants and cafes, by **BeerFlow Technologies**.

Billing, deals, credit parties (khata), stock, expenses and reports.
All data stays in the browser / till computer (IndexedDB). No internet or server required.

Each installation is independent: the shop sets its own name, logo (shown only on receipts), menu, stock and passwords.

## Requirements

- Node.js 22 or newer
- Windows, macOS or Linux

## Run

```bash
npm install
npm run dev
```

Open http://localhost:8080

## Build Windows installer

```bash
npm run build:exe
```

## First run

Setup wizard asks for shop name, owner and cashier passwords.
These replace the starter logins.

## White-label / multi-restaurant

- App UI shows BeerFlow branding (logo mark, colors).
- Restaurant logo is uploaded in Settings and appears only on the printed / shown bill.
- Receipt footer can show "Powered by BeerFlow Technologies".
- Change shop name, address, phones, menu and stock per installation.

## Support

BeerFlow Technologies — Karachi, Pakistan  
WhatsApp: +92 322 2301920  
Email: beerflowtechnologies@gmail.com
