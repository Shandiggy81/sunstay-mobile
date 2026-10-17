390 × 844 mobile emulation, Chromium, device scale 1.

- [Before](before.png): unchanged main at `781beb2`.
- [After](after.png): Sunny suggestion cards include key amenity icons and short labels.

The app was run locally. Browser request interception kept only the first three
built-in demo venues and replaced their tags to exercise wrapping:

| Venue | Browser-only tags |
| --- | --- |
| Wonderland Bar | Pram Friendly, Wheelchair Accessible, Pet Friendly, Hidden |
| The Emerson Rooftop | Pram Friendly, Pet Friendly |
| The Vineyard | Pram Friendly |

Open Sunny, choose **Family-friendly**, then view the suggested venues. Weather
requests were blocked for a stable unavailable-weather state. Supabase responses
were intercepted; no database writes or backend chat calls were made. These tag
fixtures were never added to app source or the database.

Browser assertions checked seven loaded 18 × 18 amenity icons, every suggestion
card's touch target ≥ 44 px, no horizontal page overflow, the extended accessible
names, and opening Wonderland Bar's full venue card from its suggestion.
