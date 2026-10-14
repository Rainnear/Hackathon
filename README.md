# Sakto

An installable web app (PWA) for preparing the Province of Iloilo's Financial Assistance to Barangay Tanods documents: encode each barangay's tanods, check every requirement, and print the masterlist, payroll and cover sheet.

Everything is stored on the device (IndexedDB). There is no server and no login. After the first visit the app works with no internet.

## Run it

```bash
npm install
npm run dev        # development server at http://localhost:5173
npm run build      # type-check and build to dist/
npm run preview    # serve the built app, with the service worker, at http://localhost:4173
npm run lint
```

The service worker (offline mode and the install prompt) only runs in the built app, so use `npm run build && npm run preview` to test those.

## Install on a phone

Browsers only allow installing and offline mode over **https** (or on `localhost`). To use Sakto on a phone, deploy the `dist/` folder to any static host, such as Netlify, Vercel, Cloudflare Pages or GitHub Pages. No server code or rewrite rules are needed, because routes use `#/…` links.

- **Android (Chrome):** open the site, then tap **Install app** in the header, or ⋮ › **Install app**.
- **iPhone (Safari):** open the site, then Share › **Add to Home Screen**.

For a quick look on a phone over Wi-Fi, `npm run dev -- --host` prints a network address. The app works there, but it won't install or work offline, because that address is plain http.

## How it's organized

| Path | What's there |
| --- | --- |
| `src/data/municipalities.ts` | Barangay lists and tanod limits per municipality, the provincial signatories, and the minimum amount. Add other municipalities here. |
| `src/domain/` | Pure logic: types, name cleanup, all the checks (`analyze.ts`), sample data, and backup files. |
| `src/state/` | The saved data (zustand + IndexedDB), hash routes, toasts. |
| `src/pages/` | The four steps: Setup, Barangays, Review, Print. |
| `src/documents/` | The printed forms. Their styles in `src/styles.css` reproduce the official templates, so they stay black on white. |

## Keeping data safe

Data lives only in the browser on that device. Clearing the browser's site data, or losing the phone, loses it. Use **Setup › Your data › Export backup** regularly, and keep the `.json` file somewhere safe. **Restore from backup** loads it on any device.

## Printing

Use long bond paper (8.5 × 13 in). In the print dialog, set margins to none and turn off headers and footers. The payroll prints landscape.

## Regenerating the icons

The icons in `public/` are generated from `public/logo.svg`:

```bash
npx pwa-assets-generator
```
