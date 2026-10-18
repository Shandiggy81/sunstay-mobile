# Cursor Cloud VM specifics

Moved from AGENTS.md. These steps assume a Cursor Cloud Agent VM (tmux portal
config under `/exec-daemon`, a `/workspace` checkout, an X display on `:1`,
chrome-devtools MCP). They do not apply on Windows or in other agents' containers.

## Dev server in tmux

Run the dev server inside tmux so it outlives a single command:

```bash
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s sunstay-dev -c /workspace -- bash -l
tmux -f /exec-daemon/tmux.portal.conf send-keys -t sunstay-dev:0.0 \
  'npm run dev -- --port 5173 --strictPort' C-m
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/    # expect 200
```

## Driving the chrome-devtools MCP browser

Two separate Chrome instances run in this VM:

1. The **visible** browser, launched via `x-www-browser`. Not under your control.
2. The **CDP** browser, launched by chrome-devtools-mcp with
   `--user-data-dir=/home/ubuntu/.cache/chrome-devtools-mcp/chrome-profile`.
   This is the only one the `chrome-devtools` tools drive.

They look identical on screen, so it is easy to drive one and screenshot the
other. Every `chrome-devtools` call needs an explicit `pageId` (get it from
`list_pages`); omitting it is a validation error.

The X display is `:1`, not `:0`. To bring the CDP window to the front before
recording or screenshotting:

```bash
export DISPLAY=:1
CDP_PIDS=$(pgrep -f 'chrome-devtools-mcp/chrome-profile' | tr '\n' '|' | sed 's/|$//')
for id in $(xdotool search --name "Google Chrome"); do
  pid=$(xdotool getwindowpid "$id")
  echo "$pid" | grep -qE "^($CDP_PIDS)$" && CDP_WIN=$id
done
xdotool windowsize "$CDP_WIN" 1500 1000 windowmove "$CDP_WIN" 60 40 windowactivate "$CDP_WIN"
```

## Capturing artifacts

`take_screenshot` cannot write to `/opt/cursor/artifacts` or `/workspace` — both
are outside its allowed roots. Capture from X11 instead:

```bash
export DISPLAY=:1
ffmpeg -y -v error -f x11grab -video_size 1920x1200 -i :1 -frames:v 1 /tmp/grab.png
```

For a phone-sized still, emulate the viewport at `1x` (so screen pixels map 1:1),
put the CDP window at a known position, then crop. With the window at
`(win_x, win_y)` and the automation infobar visible, the page's top-left on
screen is `(win_x + 4, win_y + 136)`:

```bash
xdotool windowsize "$CDP_WIN" 501 1010 windowmove "$CDP_WIN" 60 40   # 1010 tall fits a 844px viewport
# emulate { pageId, viewport: "390x844x1,mobile,touch", networkConditions: "Offline" }
python3 -c "
from PIL import Image
Image.open('/tmp/grab.png').convert('RGB').crop((64,176,64+390,176+844)).save('/tmp/phone.png')"
cp /tmp/phone.png /opt/cursor/artifacts/screenshot_thing_mobile.png
```

Always open the cropped PNG to confirm the offset before using it.

Pillow is not installed by default; `pip3 install pillow` works. ImageMagick and
scipy are not available. ffmpeg is.

For videos, `RecordScreen` timelapses long sessions, so a state that is on screen
briefly can vanish from the result. Hold each step for a while (sleep 8-20s
between actions), then tighten the result afterwards:

```bash
ffmpeg -y -ss 38 -to 160 -i raw.mp4 -filter:v "setpts=PTS/3,fps=30" -an \
  -c:v libx264 -crf 24 -pix_fmt yuv420p demo.mp4
```
