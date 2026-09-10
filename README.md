# DealRadar — prototype

Find the best F&B deal near you right now (breakfast, brunch, lunch, happy hour, dinner, late night),
ranked by savings, whether it is on now, how long it takes to get there, and the weather.

One codebase for iOS, Android and web (Expo / React Native, TypeScript). Runs fully offline on seed
data; adds live Google opening hours and travel times when a key is supplied.

## Run it

```bash
npm install
npx expo start          # scan the QR code with Expo Go (iOS/Android), or press w for web
```

- Without any keys: seed opening hours, estimated travel times, live weather (Open-Meteo, no key).
- With a Google key: copy `.env.example` to `.env`, set `EXPO_PUBLIC_GOOGLE_MAPS_KEY`
  (enable **Places API (New)** and **Routes API** on the key), restart `expo start`.
  The header line switches from "seed hours · estimated travel" to "live hours · Google travel times".

Use the **Time** chips (Today 17:30, Sat 10:30 …) to demo happy hour or weekend brunch at any time of day,
and the **City** chips to demo Macau from Singapore.

## What is in the box

```
app/                     screens (expo-router)
  index.tsx              ranked feed + filters (deal type, travel mode, time, city)
  deal/[id].tsx          deal detail, score breakdown, directions
src/
  types.ts               Venue / Deal / TimeWindow / RankedDeal model
  data/seed.ts           curated sample venues + deals for Singapore and Macau
  data/cities.ts         supported cities and nearest-city detection
  engine/hours.ts        opening-hours and deal-window logic (handles past-midnight windows)
  engine/ranking.ts      the score model (see below)
  engine/geo.ts          haversine + offline travel-time estimates
  providers/places.ts    Google Places API (New): live hours, Place ID resolution
  providers/routes.ts    Google Routes API: one route-matrix call for all venues
  providers/weather.ts   Open-Meteo current conditions + 2-hour rain probability
  hooks/useDealFeed.ts   orchestration: location → weather + hours + travel → rank
pipeline/
  extract-deals.ts       Claude-powered extraction of deals from venue web pages / pasted text
  sources.json           venue URLs to scan
```

### Score model (0–100)

| Component | Points | Rule |
|---|---|---|
| Value | 0–40 | % saving (capped at 70%); unpriced offers get half marks; × confidence |
| Timing | 0–30 | full marks if ≥60 min remain after you arrive; "starts soon" earns up to 70% of that |
| Travel | 0–20 | 20 at ≤5 min, tapering to 0 at 45 min |
| Weather | −15–0 | rain: outdoor venue −8, walking −up to 7; ≥33 °C long walks −up to 5 |

Deals that end before you can arrive, or whose venue reports closed, are marked unreachable and sink to the bottom.
Every card shows its reasons on the detail screen so the ranking is explainable.

## Deal data workflow (curated + AI extraction)

1. Add venue URLs to `pipeline/sources.json`.
2. `cd pipeline && npm install && export ANTHROPIC_API_KEY=… && npm run extract`
   (or `npm run extract -- --venue sg-level33 --text caption.txt` for an Instagram caption).
3. Review `pipeline/out/deals.extracted.json` (each deal carries the verbatim evidence snippet).
4. Paste approved deals into `src/data/seed.ts`; set `confidence: 1` once verified with the venue.

Seed deals shipped here are **samples** (confidence 0.5–0.8) and are labelled "Unverified" in the app.

## Tests

```bash
npm run typecheck
npm test               # hours + ranking engine unit tests
```

## Known limits of the prototype

- The Google key is bundled in the app (`EXPO_PUBLIC_*`). Restrict it by bundle ID / package name, and move
  Google calls behind a small backend before a public release.
- Deals live in a TypeScript file. Next step is a hosted JSON/DB feed so deals update without an app release.
- Time zones: both launch cities are UTC+8 and the app uses device local time.
- Web build uses estimated travel only unless CORS is fine for your key; native builds are unaffected.

## Roadmap

1. Hosted deal feed (Supabase or similar) + nightly extraction run with change alerts.
2. Merchant self-serve submission and user "still valid?" votes to keep data fresh.
3. Activities and events (ticketed events, cheapest ticket source) as a second feed type using the same ranking engine.
4. Push notifications: "Happy hour 4 min away starts in 15 min, rain expected at 18:00".
