# Bill Admin / Bill Customer iOS apps

This directory contains two bare React Native apps that use the existing Bun/Elysia API:

- `apps/admin` — operator dashboard and organization-scoped billing tools.
- `apps/customer` — LINE-authenticated customer balance and payment history.
- `shared` — shared API, session, formatting, theme, and native-friendly UI primitives.

## Local setup

1. Install Node 22+, Xcode, Ruby, and CocoaPods.
2. From each app directory run `bun install`.
3. Run `bun run ios:pods` in each app (or `pod install --project-directory=ios`).
4. Set the non-secret values in `src/config.ts`:
   - API base URL (an HTTPS URL for release builds; a LAN URL for a physical iPhone).
   - The appropriate LINE channel ID.
   - Customer deep-link scheme and optional default OA ID.
5. Start Metro with `bun start` and run `bun ios`.

The current backend does not expose credentials to mobile apps. Never put LINE channel secrets, OA access tokens, database URLs, admin API keys, or storage credentials in this directory.

## Deep link

Customer links use:

```text
billcustomer://open?oa=<lineOaAccountId>
```

The app validates the OA by exchanging the LINE ID token through `/api/liff/session`; the deep-link value is not trusted as an authorization credential.

## Ad Hoc IPA

Register the test device UDIDs in the Apple Developer account, configure the team and signing in Xcode, then run `bun run ios:archive` followed by `bun run ios:export:adhoc` in the desired app. The generated `.ipa` is installable only on devices covered by that profile. Root shortcuts are `bun run admin:archive`, `bun run customer:archive`, `bun run admin:export:adhoc`, and `bun run customer:export:adhoc`.

Debug builds are available as `bun run ios:debug:sim` and `bun run ios:debug:device` from either app directory. Physical-device debug builds need an HTTPS/LAN-reachable API URL and a registered development device.
