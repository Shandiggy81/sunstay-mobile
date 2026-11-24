# Partner preview: Guest view on short phones

Branch: `claude/partner-guest-view-short-phones`. Baseline: main `f71db4c` (after #319). "Before" is the
same tree without the new rule, so both columns show #319's pressed view-bar colours.

Below 1024px the partner preview shows the editor or the guest card, with the Edit | Guest view bar
underneath. Since #313, `.ss-partner-guest-frame` kept a 420px floor, so on screens shorter than about
683px the guest card ran past the bottom of the panel body and painted over the bar. The frame now has
no floor below 1024px. The card takes the space left above the bar and scrolls inside its frame. From
1024px the editor and the card still sit side by side, and the frame keeps its 420px floor.

## Captures

Playwright Chromium, the e2e build (`dist-e2e`, fake Supabase, demo venues), device scale factor 2.
Mr Tulk (`/?venue=dv-20`) on Monday 19 October 2026 at 12:15 Melbourne time, with a mocked sunny
forecast. Open the partner preview, then tap Guest view. The guest card's score ring reads 0 because
this setup has no venue reading, the same as earlier partner preview captures.

| Viewport | Before | After |
| --- | --- | --- |
| 320×568 | [guest-view-before-320x568.png](guest-view-before-320x568.png) | [guest-view-after-320x568.png](guest-view-after-320x568.png) |
| 375×667 | [guest-view-before-375x667.png](guest-view-before-375x667.png) | [guest-view-after-375x667.png](guest-view-after-375x667.png) |
| 390×844 | [guest-view-before-390x844.png](guest-view-before-390x844.png) | [guest-view-after-390x844.png](guest-view-after-390x844.png) (byte-identical) |

## Measurements

Frame bottom against the bar's top, in CSS px. A "hit" is `document.elementFromPoint` at the
button's centre and 4px below its top edge.

| Viewport | Before | After |
| --- | --- | --- |
| 320×568 | Frame ends at 655.5, bar starts at 503: the bar is fully covered and both points hit the card | 503 and 503; both buttons hit at both points |
| 375×667 | 619.5 and 602: the top 17.5px are covered, and 4px below each button's top hits the card's footer | 602 and 602; both buttons hit at both points |
| 390×844 | 779 and 779 | Unchanged |

After the fix, a sweep of widths 320, 360, 375, 390, 414, 768 and 1023 against heights from 460 to
844, with a special typed and the heating answer showing, found no overlap and every hit on its
button. Before it, the same widths had a covered button point at every height up to 667px (700px
at 320 wide). Landscape phones from 568×320 to 932×430 also keep the bar clear. At 1024×768,
1280×800 and 1440×900 the frame's computed `min-height` is still 420px and the view bar stays hidden.
A hotel's guest card (Lancemore Crossley St) has a taller footer, 139px. Its frame also ends at the
bar at 320×480, 320×568 and 375×667, leaving 77, 165 and 264px to scroll in.

## Limits

Around 480px tall, the frame is 150–190px, and 77px of that is the card's own footer. The card
still scrolls, but only a sliver of it shows, and the jump to Specials leaves the section at or just
below the bottom of that space. At 320×568 the jump shows 69 of the section's 78px; at 375×553 and
taller it shows all of it. In landscape (320–430px tall) the frame is 49–119px, so the card shows
little more than its footer. Before the fix, the card ran off the bottom of the screen there and
covered the bar.
