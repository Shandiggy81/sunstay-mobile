# Weather function: local browser checks

Checked the Vite dev app in mobile Chromium at **390×844**, with reduced motion
and a fixed 11am Melbourne clock. All external browser requests were intercepted
or blocked. Supabase configuration uses only the reserved `.invalid` fixture host;
no live Supabase project was called, changed or deployed.

| Scenario | Result | Screenshot |
| --- | --- | --- |
| No Supabase configuration | Existing direct Open-Meteo route parses the raw fixture and shows `23° Clear sky`; no function request. | [Direct fallback](direct-390.png) |
| Fake Supabase configuration | `/functions/v1/weather` supplies the raw fixture; existing header parsing still shows `23° Clear sky`. | [Function route](proxy-390.png) |
| Venue's deferred air-quality section | Opening the actual card's weather details requests `kind=air`; its existing hook renders `Pristine`. | [Card air quality](proxy-card-air-390.png) |
| Function and direct upstream both fail | The existing honest `Live weather unavailable` state remains visible. | [Unavailable](unavailable-390.png) |
| Function returns HTTP 502, direct succeeds | The named direct fallback preserves `23° Clear sky`. | Request assertions in [observations.json](observations.json) |

The successful function scenario also mounts the real `HourlyForecastStrip`,
`useAirQuality` and `useOpenAQ` in an isolated local test page. The current card
does not import the standalone hourly component or `useAirQuality`, so this
checks their request and parsing paths without adding production UI or patching
application state. The hourly strip reports `success` with 12 forecast entries;
both current and hourly PM2.5 consumers render `Pristine`.

All three kinds (`forecast`, `hourly`, `air`) reached `/functions/v1/weather`
with GET, `apikey` and Bearer anon headers. Successful proxy responses made
**zero direct Open-Meteo calls**. The four scenarios had no unhandled page errors
and no horizontal overflow. React's development effect replay can produce an
initial aborted request; the assertions do not rely on a single request count.
The existing no-token map failure and sample venues are visible deliberately.

## Fixtures and limits

`npm test` passed all **1,298 tests**, including 21 new client/function tests.
`npm run build` passed with the expected large-chunk advisories for map,
mapsgl and index. No dependencies changed; the existing install was used.

Screenshots use the existing raw Open-Meteo fixture from
`e2e/fixtures/weather.js` and a raw air-quality fixture with PM2.5 of 8. These are
local responses, **not a real weather-service success**. The real application
weather parsers, components, effects and fallback handling run normally.

A single read-only request to the official free forecast endpoint was attempted
from this environment. It failed before reaching Open-Meteo: the network proxy
returned **CONNECT 403** (`curl` exit 56, HTTP 000). Live upstream availability,
the undeployed Edge Function runtime, and the paid customer endpoints therefore
remain unverified here. Deno is not installed; the HTTP handler is covered by
Node tests rather than a local Supabase runtime. No proxy bypass or live-project
request was attempted. `enrich-microclimate` is unchanged.

## Paid-plan setup after review

After purchasing Open-Meteo API Standard, Shannon must set **only the server-side
Supabase secret `OPEN_METEO_API_KEY`**. Never create a `VITE_` variable for this
key. The function then selects the customer forecast and air-quality hosts
automatically; the app's existing Supabase URL and anon key stay the same.
The paid air-quality hostname is confirmed by Open-Meteo's official website
source: its [air-quality page selects `air-quality` and `air-quality-api`](https://github.com/open-meteo/open-meteo-website/blob/53f0bf019395abd29d8d5a404e7a39c3457f90d7/src/routes/en/docs/air-quality-api/%2Bpage.svelte#L478-L485),
and its [request builder prefixes customer hosts](https://github.com/open-meteo/open-meteo-website/blob/53f0bf019395abd29d8d5a404e7a39c3457f90d7/src/lib/components/response/results-preview.svelte#L176-L185).
After the function and paid key are verified, a follow-up can set
`ALLOW_DIRECT_OPEN_METEO = false` to disable the temporary free-host browser
fallback. Cache entries and rate limits are shared by visitors handled by the
same warm function isolate; they are not persistent or global across isolates.

## Reproduce

```sh
node docs/screenshots/weather-function/capture.mjs
```

The harness starts local Vite servers on ports 5198–5201 (override the first port
with the first argument). It uses `/usr/bin/chromium`, overridable with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. It changes environment settings only in
its own process and creates no `.env` files or credentials.
