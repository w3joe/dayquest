# Data ingestion

Real exports go in; a normalised day (the `data/input.json` shape, plus highlight candidates) comes out.

| Source | File | Gives us |
|---|---|---|
| Google Maps Timeline | on-device export `Timeline.json` (`semanticSegments`, or a bare segment array) or Takeout's legacy `Semantic Location History` (`timelineObjects`) | stops (visits ≥ 5 min), transit movements (`IN_BUS`, `IN_SUBWAY`, `IN_TRAIN`, `IN_TRAM`) |
| Apple Health | `export.xml` from the Health export zip | workouts (type, duration, distance) and steps summed inside each workout window |
| GPX / Strava | `.gpx` with timed `<trkpt>`s | route, distance, duration (Health stats win if both exist; the GPX route is attached) |
| Photos | JPEG/PNG/WebP with EXIF | capture time and GPS, used to place each photo at a stop. Metadata is read only, never stored |

Timeline is required (it supplies the places); the rest are optional and failures in them become `warnings`, not errors.

## Try it

```bash
# the fixtures in data/fixtures are the demo day in the real formats
curl -s -F timeline=@data/fixtures/timeline.json -F health=@data/fixtures/health-export.xml \
  -F gpx=@data/fixtures/route.gpx -F photos=@data/fixtures/ramen.jpg -F photos=@data/fixtures/park.jpg \
  -F name=Lucas localhost:3000/api/ingest | jq .

npx tsx scripts/ingest-demo.mts        # same thing through the real network lookups, printed
node scripts/make-fixtures.mjs         # regenerate the fixtures
```

## Lookups (all best-effort, behind `Lookups` in `lib/ingest/types.ts`)

- **Place names and food:** OpenStreetMap Overpass (two mirrors, circuit breaker when overloaded), falling back to Nominatim reverse. Food/park/tourist is classified from OSM tags.
- **Landmarks and reference photos:** Wikipedia geosearch + REST summary (lead image).
- **Bus route / tube line:** TfL journey planner between the two Timeline points. Timeline records only the *mode*, so the route number is TfL's best guess for that journey, not a record of what you rode (`routeSource: "tfl"`). If TfL fails the leg is a generic bus/tube animation and a warning is returned.

The public OSM services are rate limited (Nominatim: 1 request/second, enforced in `lib/ingest/http.ts`) and Overpass is frequently overloaded. Expect a live run to take a minute or more. Tests use offline stubs of these lookups.

## Not done yet

- The Today screen still animates the bundled demo data. Its "import" buttons are not wired to `/api/ingest`.
- `/api/generate-day` (B) does not consume `candidates` yet.
- Apple Health exports are parsed fully in memory (150 MB cap); streaming would be needed for multi-GB exports.
