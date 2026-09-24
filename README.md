# BSG realtor app

One app, two ways to install:

| Phone   | How realtors get it | Notifications |
|---------|---------------------|---------------|
| Android | Google Play (`com.mycompany.callcenter`) — this repo builds it | Native OneSignal (`android/`) |
| iPhone  | Safari → Add to Home Screen from **bsglink.online** | OneSignal web push (`web/sw.js`) |

Both log in to OneSignal with `app_users.id`, the same id the database already pushes every new lead to.

## Folders
- `web/` — the realtor app itself. Upload this folder to Netlify. The Android app shows this website.
- `android/` — the Android shell (Capacitor) + `BsgPushPlugin.java` (native OneSignal).
- `www/` — only the "no internet" page inside the Android app.
- `.github/workflows/android.yml` — builds the Play Store file in the cloud.

## Build a new Android version
1. GitHub → **Actions** → **Build Android app** → **Run workflow**.
2. Version code: one higher than the last one on Google Play.
3. When it finishes (about 10 minutes), download the zip at the bottom of the run page.
   - `app-release.aab` → Play Console (Internal testing first).
   - `app-release.apk` → can be installed directly on a test phone.

Most changes only need a new upload of `web/` to Netlify — no new Play version.

## Settings the build needs (Settings → Secrets and variables → Actions)
- Variable `APP_URL` — address of the uploaded `web/` folder (test site first, later `https://bsglink.online`).
- Secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
  Never put the key or passwords in the code.
