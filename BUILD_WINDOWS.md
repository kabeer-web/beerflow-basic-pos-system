# Windows `.exe` banana — BeerFlow POS

Yeh guide **Windows PC** pe chalegi. Is Linux sandbox se ready `.exe` file nahi banti; aap apne laptop pe build karoge.

## Aapko kya milega

| File | Matlab |
|------|--------|
| `BeerFlowPOS-Setup-1.1.0.exe` | Normal installer (Start Menu + Desktop shortcut) |
| Uninstall via Windows Settings | **App data permanently delete** (`deleteAppDataOnUninstall: true`) |

Data folder: `%APPDATA%\BeerFlowPOS`  
Uninstall ke baad yeh folder delete ho jata hai → **reinstall bilkul fresh** hota hai. Purana IndexedDB wapas nahi aata.

---

## Requirements (Windows)

1. **Node.js 22+** — https://nodejs.org  
2. Internet (pehli baar `npm install` ke liye)  
3. ~1 GB free disk (Electron download ke liye)

---

## Steps

### 1. ZIP extract karo
`pos_extract` folder mein jao (Command Prompt / PowerShell).

```bat
cd path\to\pos_extract
```

### 2. Install dependencies

```bat
npm install
```

Pehli baar Electron download hoga — time lag sakta hai.

### 3. Windows installer banao

```bat
npm run electron:dist
```

Yeh karega:
1. Web app build  
2. Files `electron-web/` mein copy  
3. NSIS installer `release\` folder mein

### 4. Installer kahan milega

```
pos_extract\release\BeerFlowPOS-Setup-1.1.0.exe
```

Is `.exe` ko till computer pe run karke install karo.

---

## Uninstall behaviour (aapki requirement)

1. **Windows Settings → Apps → BeerFlow POS → Uninstall**  
   - `deleteAppDataOnUninstall: true` ki wajah se `%APPDATA%\BeerFlowPOS` delete hota hai  
   - IndexedDB / Local Storage / cache sab gayab  

2. **App ke andar Settings → Uninstall**  
   - Backup maanga jata hai  
   - Phir Electron poora `userData` folder wipe karta hai aur app band  

3. **Dobara install**  
   - Empty shop — koi purana bill / stock / party nahi aata  

---

## Dev mode (test without installer)

Terminal 1:
```bat
npm run dev
```

Terminal 2:
```bat
npm run electron:dev
```

Electron window `http://127.0.0.1:8080` load karegi.

---

## Agar build fail ho

1. **`Could not find index.html`**  
   - Pehle `npm run build` chalao  
   - Dekho `dist` ya `.output` folder mein `index.html` kahan hai  
   - `scripts/prepare-electron-web.mjs` us path ko already try karta hai  

2. **electron-builder error / code signing**  
   - Development builds unsigned hoti hain — Windows SmartScreen warning normal hai  
   - “More info → Run anyway” se chal sakti hai  

3. **Antivirus**  
   - Kabhi kabhi naya unsigned installer block hota hai — allow karo  

---

## Portable version (bina install)

```bat
npm run electron:dist:portable
```

Ek single `.exe` milti hai jo install ke baghair chalti hai.  
**Note:** Portable mode mein Windows “Uninstall” program list mein nahi aata; data usi folder ke saath rehta hai. Shop till ke liye **NSIS Setup** better hai.

---

## Summary

| Sawal | Jawab |
|-------|--------|
| `.exe` yahan se ready? | Nahi — Windows pe `npm run electron:dist` se banao |
| Uninstall permanent? | Haan — AppData folder delete |
| Reinstall pe purana data? | Nahi, empty start |
| Browser wala ZIP ab bhi? | Haan, `npm run dev` se pehle jaisa |

BeerFlow Technologies · BeerFlow
