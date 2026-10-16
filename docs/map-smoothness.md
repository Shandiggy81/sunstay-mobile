# Map smoothness at 1,000 venues

Investigated by Codex (16 Oct 2026, real Mapbox Standard style, `?stress=1000`,
390x844, 4x CPU throttle, SwiftShader). Its baseline findings:

- Panning already reuses marker DOM; no rebuilds.
- Zooming 17 -> 13 created 757 markers and reused 83, then removed all 840 to
  show five clusters: 2,127 ms in the marker callback, 3,020 ms longest task.
- Opening a pin at zoom 17 runs the card's fly-to zoom 15 and created 790
  markers (895 retained): 1,652 ms callback, 2,557 ms task.

Cause: with `clusterMaxZoom: 14`, everything at zoom 15-16 was an individual
DOM pin, and Mapbox briefly exposes hundreds of leaf features while tiles load.

## Change

- Clusters hold through zoom 16 (`MAP_CLUSTER_MAX_ZOOM`); pins split at 17.
  Bubble radius, markup, moment badges and click-to-zoom are unchanged.
- A selected venue inside a cluster keeps its own highlighted pin (the card's
  fly-to lands at zoom 15). Selection changes request a marker sync.
- `querySourceFeatures` results are de-duplicated (one copy per venue/cluster
  across tiles) before any marker work.
- An unchanged payload no longer calls `setData` on the cluster source (which
  re-clusters and reloads every tile); a re-created source always gets data.
- The heatmap weight is only computed while the comfort heatmap is on.

## Check (Claude Code, same day)

Real mapbox-gl in headless Chromium with a blank local style (no token), 4x
throttle, `?stress=1000`, main-thread long tasks per action:

| Action | Before | After |
|---|---|---|
| Jump to zoom 15 | 840 pins, 822 ms longest / 1,806 ms total | 36 pins + clusters, 684 / 1,044 ms |
| Jump to zoom 16 | 193 pins, 2,032 / 2,438 ms | 53 pins + clusters, 1,015 / 1,349 ms |
| Jump to zoom 17 | 96 pins, 581 / 775 ms | 96 pins, 317 / 583 ms |
| Tap a pin (fly to 15) | 840 pins, 730 / 1,645 ms | 37 pins, 1 selected, 326 / 779 ms |

Software rendering in a throttled VM: compare the columns, not the absolute
numbers. Check on a phone after deploy.
