# Nickel — Native apps (iOS + Android)

This folder is a **Capacitor** shell that wraps the live web app at **https://nickelcare.com**.
Because it loads the real, server-rendered site, **every web deploy updates the apps
instantly** — you only rebuild/resubmit the native binary when something in
`capacitor.config.ts` or the native projects changes (icons, splash, permissions,
push, app version).

There are three "app" surfaces, all from the same codebase:
1. **Web app (PWA)** — already live at nickelcare.com. Users can "Add to Home Screen";
   an install prompt appears automatically. Nothing to submit.
2. **Android app** — Google Play.
3. **iOS app** — Apple App Store.

---

## 0. One-time prerequisites

| For | You need |
|-----|----------|
| Both | Node 20+, and this folder: `cd nickel-native && npm install` |
| Android | **Android Studio** (SDK + Gradle), a Google **Play Console** account ($25 once) |
| iOS | A **Mac** with **Xcode** + CocoaPods (`sudo gem install cocoapods`), an **Apple Developer** account ($99/yr) |

> Claude can run every `npx cap …` / asset-generation step for you on a machine that has these
> installed. Claude **cannot** create the developer accounts, sign binaries, or upload to the
> stores for you — those need your credentials and are done in Xcode / Android Studio / the
> store consoles. Steps that need you are marked **(you)**.

---

## 1. Install & add the platforms

```bash
cd nickel-native
npm install
npx cap add ios
npx cap add android
```

This generates the `ios/` and `android/` native projects (git-ignored — they're
regenerated from `capacitor.config.ts`).

## 2. Generate icons & splash screens

Source art lives in `resources/` (`icon.png` 1024×1024, `logo.png` for the splash).

```bash
npm run assets      # writes all icon/splash sizes into ios/ and android/
npx cap sync
```

## 3. Native permissions (needed for the verification camera)

The provider verification screen uses the camera (`getUserMedia`). Add:

- **iOS** — `ios/App/App/Info.plist`:
  ```xml
  <key>NSCameraUsageDescription</key>
  <string>Nickel uses your camera to verify your identity and PRC licence.</string>
  <key>NSPhotoLibraryUsageDescription</key>
  <string>Nickel lets you upload documents and photos for verification.</string>
  ```
- **Android** — `android/app/src/main/AndroidManifest.xml` (inside `<manifest>`):
  ```xml
  <uses-permission android:name="android.permission.CAMERA" />
  <uses-permission android:name="android.permission.INTERNET" />
  ```

Then `npx cap sync` again.

## 4. Run on a device / simulator

```bash
npm run open:ios       # opens Xcode  → pick a simulator/device → Run
npm run open:android   # opens Android Studio → Run
```

---

## 5. Ship to the stores  **(you)**

### Android (Google Play)
1. In Android Studio: **Build ▸ Generate Signed Bundle / APK ▸ Android App Bundle (.aab)**.
   Create an upload keystore the first time and **keep it safe** (losing it blocks future updates).
2. Play Console ▸ create the "Nickel" app ▸ upload the `.aab` ▸ fill store listing
   (screenshots, description, privacy policy URL) ▸ submit for review.

### iOS (App Store)
1. In Xcode: set the **Team** (your Apple Developer account) under Signing & Capabilities.
2. **Product ▸ Archive** ▸ **Distribute App ▸ App Store Connect**.
3. App Store Connect ▸ create the "Nickel" app ▸ attach the build ▸ fill the listing ▸ submit.

### Store-listing assets you'll need (both)
- App name: **Nickel**  ·  Subtitle: *Home therapy, on your schedule*
- Description (see `store-listing.md` below — create as needed)
- Screenshots (take from the running app)
- **Privacy policy URL** — reuse the in-app Terms / a public privacy page
- App icon (auto from `resources/icon.png`)

---

## 6. App Store review notes (important)

- **Guideline 3.1.1 (in-app purchase):** Nickel sells a **real-world service delivered offline**
  (a therapist visiting a home). Apple explicitly permits third-party payment (PayMongo) for
  physical/real-world services — do **not** switch to Apple IAP. State this in the review notes.
- **Guideline 4.2 (minimum functionality):** the app is more than a website — it uses the
  **camera** (verification), **notifications** surface, and account/booking flows. Mention these.
- Provide a **demo patient login** (and a demo provider login) in App Review notes so the
  reviewer can see the full flow.

---

## 7. Updating later

- **Content / features / bug fixes** → I change the web app and deploy. Apps update instantly.
  No resubmission.
- **App icon, splash, permissions, app version bump, push** → change here, `npx cap sync`,
  rebuild, resubmit.

## 8. Bumping the version (for a resubmission)
- iOS: Xcode ▸ target ▸ **General ▸ Version / Build**.
- Android: `android/app/build.gradle` ▸ `versionCode` (increment) and `versionName`.

---

## Optional next step — Push notifications
The in-app bell works today. To also push to the lock screen:
1. `npm i @capacitor/push-notifications` and add it in the native projects.
2. iOS: enable Push in Xcode capabilities + APNs key in Apple Developer.
   Android: add Firebase (`google-services.json`) for FCM.
3. Add a small endpoint on nickelcare.com to store device tokens and a sender to
   push on booking events. Ask me to wire this up when you're ready.
