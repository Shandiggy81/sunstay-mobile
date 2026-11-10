# CDP offline-emulation recipe

Moved from AGENTS.md.

Used to verify `src/components/common/NetworkErrorModal.jsx`. Order matters: the
modal only renders once the connection is gone, so anything it needs from the
network has to be cached *before* you cut the link.

```
1. emulate         { pageId, }                                  # no args -> online, no overrides
2. navigate_page   { pageId, url: "http://localhost:5173/" }
3. evaluate_script { pageId, function: sleep ~2500ms }           # let idle-time prefetches finish
4. emulate         { pageId, networkConditions: "Offline" }      # flips navigator.onLine, fires `offline`
5. take_snapshot   { pageId }                                    # a11y tree: confirm dialog + get button uid
6. click           { pageId, uid }
7. evaluate_script { pageId, ... }                               # assert on the DOM
8. emulate         { pageId }                                    # back online -> modal auto-dismisses
```

CDP offline emulation does set `navigator.onLine = false` and fire the `offline`
event, so `window.addEventListener('offline', ...)` handlers work under it.

To keep a viewport override across an offline toggle, repeat the `viewport`
argument on every `emulate` call — it is not sticky:

```
emulate { pageId, viewport: "390x844x3,mobile,touch", networkConditions: "Offline" }
```

Assert on state with `evaluate_script` rather than only screenshots:

```js
() => ({
  onLine: navigator.onLine,
  modalOpen: !!document.querySelector('[role="dialog"]'),
  status: document.querySelector('[role="status"]')?.textContent,
})
```

Two cases worth exercising on any network-error UI here:

- **Retry while still offline** — the probe in `NetworkErrorModal` must fail and
  leave the dialog open.
- **`navigator.onLine` wrongly false** (captive portals do this). Simulate it
  with the network actually up: `window.dispatchEvent(new Event('offline'))`
  reopens the modal, and retry should then succeed and dismiss it.
