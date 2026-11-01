# DayQuest for iOS

A native companion that records your day in the background and turns it into a DayQuest automatically when the day ends. You don't have to upload anything.

- **Background recording.** Uses Core Location visits and significant-location changes, which are low on battery and relaunch the app after iOS kills it. You can add detailed GPS in Settings. Needs **Always** location permission.
- **End of day.** After the chosen time (default 21:00), the next location wake, background refresh or app open clusters the trace into stops. It then sends them to `POST /api/generate-day` as `day.locations`, streams the generation log, and sends a notification when the day is ready.
- **Result.** Opens `/day/<id>` from the web app in a web view, with a share button.
- **iPhone Duo.** The Today screen is stacked on the folded or narrow screen. It goes side by side (map | status, log, stops) when the screen is at least 600 pt wide, or in landscape.

## Run it

```bash
cd ios
xcodegen generate        # only needed after editing project.yml
open DayQuest.xcodeproj
```

1. In **Signing & Capabilities**, pick your team. If the bundle ID `app.dayquest.ios` is taken, change it, and change the matching `BGTaskSchedulerPermittedIdentifiers` prefix.
2. Start the web app so the phone can reach it: `npm run dev` (it listens on all interfaces). Find the Mac's address with `ipconfig getifaddr en0`.
3. Run on your phone. Open **Settings** (gear icon) and set the server to `http://<mac-ip>:3000`, or to the deployed URL.

## Demo controls

On the Today screen:

| Button | What it does |
|---|---|
| SEED DEMO | Loads the SPEC §3 London Saturday (same stops as `data/input.json`) onto today |
| REPLAY LIVE | Same trace, with stops appearing one by one on the map |
| END IN 8S | Moves the end of the day to 8 s from now, so the automatic path runs on stage |
| START A FRESH DAY | Clears today's trace and result |

For the simulator, `DayQuest/LondonDay.gpx` walks the same route (in Xcode, choose Debug > Simulate Location).

## Server contract

`POST /api/generate-day` now accepts an optional `day` alongside `uploads` and `spriteUrl`:

```json
{ "uploads": [], "day": { "date": "2026-11-01", "name": "LUCAS",
  "locations": [{ "t": "10:00", "lat": 51.5007, "lng": -0.1246, "label": "Parliament Square" }] } }
```

It replaces `data/input.json`'s date, player name and locations, and its workouts if you send any. Transport, photos and notes still come from the template. The mock text pipeline always picks the template highlights. `PIPELINE_TEXT=live` plans from the real stops.
