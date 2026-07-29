# Invoice Studio

A single-page invoice generator — 3-step wizard (Client → Details → Review) that produces a print-ready A4 PDF.

## Features
- Save/reuse clients, auto-remembers last invoice's client, tenure, price, description
- Auto-incrementing invoice number
- Billing period presets (this / last / next month) or custom range
- Live A4 preview, one-click **Download PDF**
- All data in browser `localStorage` — no backend

## Stack
Vite · React 18 · jsPDF · html2canvas

## Dev
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

<!-- deployed via Vercel + GitHub auto-deploy -->
