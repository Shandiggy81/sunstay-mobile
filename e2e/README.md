# Mobile browser smoke tests

```sh
npm ci
npx playwright install --with-deps chromium
npm run build
npm run test:smoke
```

The four Chromium tests use a 390×844 touch viewport and serve the production
build on `127.0.0.1:4173`. The port must be free; an existing server is never
reused. Build again after changing source. No API credentials are required.

Each test has fresh browser storage, a fixed Melbourne date, and mocked raw
Open-Meteo responses. All other external HTTP requests and WebSockets are blocked
before navigation. The app uses its unchanged demo venues and its normal
missing-Mapbox-token fallback; the suite does not test map rendering or live AI.

Assertions cover visible results and real taps without forced interaction.
Venue counts are read from the UI, so virtualized rows and demo additions do not
require hardcoded counts. Closing VenueCard restores the existing collapsed
list handle, which the test reopens to verify the venues are still available.

The existing `SunStay CI / test-and-build` job runs these tests after the build.
Failures retain screenshots/traces and upload the Playwright report for seven
days. Open a local report with `npx playwright show-report`. The filter test also
attaches a 390×844 screenshot on successful runs.

If a managed development environment blocks Playwright's browser download, an
already installed trusted Chromium can be used locally via
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:smoke`.
GitHub Actions uses Playwright's matching downloaded Chromium, not this override.
