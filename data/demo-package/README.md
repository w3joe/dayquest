# Synthetic demo package

A made-up day in London, in the formats a phone exports. **Nobody walked this exact route.** Walking and bus geometry follows real streets (OSRM); tube legs are straight lines.

- `timeline.json` Google Timeline (visits, activities with `timelinePath` GPS points every 20-30 s)
- `health-export.xml` one 75-minute walk with steps
- `route.gpx` the Regent's Park walk
- `lookups.recorded.json` hand-checked answers standing in for the OSM, Wikipedia and TfL lookups, so the demo runs offline

Regenerate: `npx tsx scripts/make-route-package.mts`. Photos are not included; use `scripts/restamp-photos.mts` to fit your own photos to this timeline.
