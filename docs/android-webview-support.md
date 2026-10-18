# Android WebView support and updates

The Android Host uses the system's **selected WebView provider**. Installing a
new browser does not by itself change that provider. `minSdk = 24` is an Android
native API requirement, not a browser version guarantee. Use a current, vendor
supported WebView; the historical versions below describe compatibility testing,
not recommended downloads.

## Current capability baseline

The current complete Host/Remote UI has a **Chromium 111 capability floor**.
The JavaScript-only floor is 93; treating it as the full application minimum
misses input isolation and layout dependencies. The audit covers the shared
Host entry, its scripts/styles/vendor media code, local/public Remote transport
and Android startup/native bridges. A version number alone cannot establish
all device, codec, networking or presentation capabilities.

| Required capability | Chromium introduction | Current use |
| --- | --- | --- |
| Optional chaining, nullish coalescing, logical assignment | 80 / 85 | Shared startup and event handlers; an older parser stops the entire script |
| `Promise.allSettled`, `replaceAll`, `Array.at`, `Object.hasOwn` | 76 / 85 / 92 / 93 | Rendering, transport and state validation |
| `crypto.randomUUID` / Web Crypto | 92 / earlier; secure context | Public transport identities and authenticated room protocol |
| `HTMLElement.inert` | [102](https://developer.chrome.com/blog/new-in-chrome-102/) | Host page focus/input isolation and modal background isolation |
| CSS `:has()` | [105](https://developer.chrome.com/blog/has-with-cq-m105) | Shared source controls, pagination and contextual control layouts |
| CSS `dvh` | [108](https://developer.chrome.com/blog/whats-new-css-ui-2023) | Native page frame and bounded floating panels |
| CSS `color-mix()` | [111](https://developer.chrome.com/docs/css-ui/css-color-mix) | Shared pressed/neutral control tokens, including unguarded declarations |
| `WEB_MESSAGE_LISTENER` | Provider feature, independently detected | Origin-scoped Android Host controls/platform/presentation bridges |
| Fetch + `AbortController`, SSE, WebSocket, WebRTC DataChannel, Canvas, WebAssembly, Web Audio + AudioWorklet | Earlier than 111; context/provider restrictions also apply | State and QR, reconnect, public Remote, export and pitch processing |

Popover (114) has explicit JavaScript feature checks and existing ordinary
popup/help paths. Native popover/top-layer enhancements, `@starting-style` and
discrete animation support are not startup requirements. They must still be
checked when changing those surfaces; absence must not be interpreted as a
successful top-layer test. No syntax polyfill or second frontend is introduced.

The local Host loopback document supplies the secure context required by crypto
and AudioWorklet. A capability report from the packaged startup document can
show a different origin/security context; it names the **document tested**.
Media codecs, audio routing, external displays and real peer connectivity need
separate device tests. Public Remote outside localhost requires HTTPS.

## Diagnosis and update action

Open **My → Settings → Diagnostics → WebView diagnostics and update**. There is
also an action on the packaged startup screen. On an old/unknown provider or
missing native bridge, a native Android dialog opens before shared frontend
startup; its capability probe deliberately uses ES5 syntax.

The report includes Android/API, actual provider/package/full version,
`WEB_MESSAGE_LISTENER`, missing UI primitives, the inspected document origin,
secure-context status and media/RTC availability. “Basic capabilities pass” is
not a claim that media, network, all devices or all features passed acceptance.
Copying it does not collect room tokens, cookies or application records.

**Check for updates** resolves the actual provider in native code and opens its
`market://details?id=...` listing. With no usable store, it opens that package's
system information page and suggests checking system updates. It does not
silently install, select a different provider, bypass signatures, clear storage
or accept a website-supplied package/URL. Store support varies by vendor; a
component with no listing may need the manufacturer's system update. Reopen
bilikara after updating, without clearing its data.

A store accepting the link does **not** prove that the package is listed or an
update exists. Availability depends on the actual provider and device/region
ROM, not just the MIUI, ColorOS or OriginOS name. If the vendor supplies neither
an independent component update nor a suitable system update, this action
cannot resolve compatibility. Installing a newer browser or an arbitrary
WebView APK does not establish that the Host's provider changed: production
devices enforce configured provider/package/signature restrictions. See
[Chromium's provider requirements](https://chromium.googlesource.com/chromium/src/+/main/android_webview/docs/webview-providers.md)
and [vendor update distribution](https://chromium.googlesource.com/chromium/src/+/main/android_webview/docs/aosp-system-integration.md).
An emulator's successful provider update does not qualify that update path on
a retail device. Supporting an engine that cannot be updated requires software
compatibility work; diagnostics and update links alone do not provide it.

Android documents the [active-provider lookup and update lifecycle](https://developer.android.com/reference/androidx/webkit/WebViewCompat#getCurrentWebViewPackage(android.content.Context))
and the [component settings action](https://developer.android.com/reference/android/provider/Settings#ACTION_APPLICATION_DETAILS_SETTINGS).
The full Host action uses the existing main-frame, exact local-origin bridge;
the startup command is restricted to the local Android main window. Remote
pages gain no update/diagnostics permission.

## Validation limits

111 is the source-audited capability floor. A provider exactly at 111 and the
reporter's MIUI hardware have not been qualified. Real emulator/provider
results and remaining native-shell errors must be reported separately; a
modern desktop browser is not a substitute. An offline, same-package/signer
provider update can prove recovery without certifying an app-store download or
a vendor's update availability. Historical test providers belong only in
isolated emulators, never in the product's download recommendations.

State startup and public room creation no longer depend on `AbortSignal.timeout`;
their bounded `AbortController` requests preserve cleanup, errors and recovery.
A LAN QR is obtained from local Host state and generated locally. Public-room
signaling is a separate operation. Neither the timeout fix nor an OS version
alone establishes that an old frontend parser/native bridge can run the app.
