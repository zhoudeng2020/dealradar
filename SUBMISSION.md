# Getting DealRadar onto TestFlight and the App Store

Realistic target: **TestFlight in 2–3 days** (mostly waiting on Apple), **App Store after the data is verified**.
Apple will reject a prototype whose deals are visibly unverified samples (Guideline 2.1 App Completeness /
4.2 Minimum Functionality), so treat TestFlight as the first milestone.

## One-time setup (your accounts, ~1 hour of clicks + Apple's processing time)

1. Apple Developer Program — enrol at developer.apple.com/programs (US$99/yr, individual is fine).
   Approval usually takes 24–48 h.
2. Expo account — sign up at expo.dev (free tier is enough for the first builds).
3. On your Mac:
   ```bash
   npm install -g eas-cli
   cd "~/Documents/Claud Code/dealradar"
   npm install
   eas login
   eas init            # links the project to your Expo account, writes projectId into app.json
   ```
4. In App Store Connect (appstoreconnect.apple.com) → My Apps → "+" → New App:
   bundle ID `com.dengzhou.dealradar`, name "DealRadar" (or your final name), SKU anything.
   Copy the numeric App ID into `eas.json` → `submit.production.ios.ascAppId`.

## Build and push (repeat for every release)

```bash
eas build --platform ios --profile production   # cloud build; EAS creates and stores certificates for you — no Xcode needed
eas submit --platform ios --latest              # uploads to App Store Connect → TestFlight
```
First build ~15–25 min. TestFlight processing ~10–30 min. Then add yourself as an internal tester and install via the TestFlight app.

## Before pressing "Submit for Review" (public App Store)

- [ ] Replace sample deals with verified ones (`confidence: 1`) — or remove the "Unverified" label only for verified deals. Reviewers read the cards.
- [ ] Real app icon (1024×1024, no alpha) → `assets/icon.png`, and matching Android adaptive icons.
- [ ] Privacy policy URL (required because the app uses location and calls third-party APIs). A one-page static site is enough.
- [ ] App Privacy "nutrition label" in App Store Connect: Location (precise, used for app functionality, not linked to identity, not tracking).
- [ ] Move the Google key behind a small backend, or at minimum restrict it to the iOS bundle ID in Google Cloud Console.
- [ ] Screenshots: 6.7" and 6.5" iPhone sets (3–5 each). Use the Time chips to capture a busy happy-hour feed.
- [ ] Review notes: state that deal data is curated per venue and that the app needs location; give a test location (e.g. Boat Quay, Singapore).
- [ ] Age rating: 17+ is safest because the content references alcohol (happy hour). Choose "Alcohol, Tobacco or Drug Use: Infrequent/Mild".
- [ ] Support URL and marketing name. Check "DealRadar" is not already taken on the App Store; have a fallback name.

## Android (later)

```bash
eas build --platform android --profile production
eas submit --platform android          # needs a Google Play Console account (US$25 one-off) and a service-account JSON
```
