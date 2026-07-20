# scripts/

One-off data migration and patch scripts. Not part of the app build — for developer reference only.

| File | Purpose |
|---|---|
| `add_happy_hour.cjs` | Initial batch import of happy hour data into venues.js by venue ID |
| `update.cjs` | Updated happy hour data import by venue name |
| `patch_bento.js` | One-off patch to add Framer Motion whileTap haptics to VenueCard bento cells |
| `fix_venue_card.ps1` | PowerShell patch to restore Weather Description block in VenueCard (lines 625–642) |
