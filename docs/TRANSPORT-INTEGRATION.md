# World scenes and transport handoff

The locations integration supplies completed location worlds and explicit route data. Transport composition does not infer visits, neighbourhoods, stations or routes from a photo. It does not change the locations UI, generate images or move existing buildings to make a route fit.

## Deliverable for the locations integration

Provide an ordered list of 1–12 world scenes. Give every scene a stable `id` when the list contains multiple scenes. IDs use 1–64 letters, digits, underscores or hyphens and must be unique within the day. Scene `kind` can repeat; for example four locations can all be `tourist`.

Each location remains a normal `DayScene` with its existing `title`, `time`, `base`, `spawn`, `exit`, `landmarks`, optional `food`, and `world`. World dimensions are tile counts, ground is one string per row, and one tile is 16 pixels. Objects use bottom-centre pixel anchors and absolute pixel collision rectangles. Supported ground characters are `g f p c r k w`. Water, object collision rectangles and lunch tables block transport paths.

Supply exactly one connection for every adjacent pair of scene IDs. There is no departure connection from the last scene. The route array can be unordered when passed to `attachJourneys`; its returned `journeys` array is always in scene order. Give connections explicit stable IDs when another service needs to refer to them. Otherwise the adapter assigns `journey_1`, `journey_2`, etc.

The following is a complete example **integration handoff**, referencing two separately published location manifests. The URLs are examples; replace them with manifests produced by the locations integration.

```json
{
  "id": "my-day",
  "date": "2026-11-01",
  "player": {
    "name": "You",
    "sprite": "/days/character/player.png",
    "walkSheet": "/days/character/player_walk.png"
  },
  "locations": [
    {
      "sceneId": "location-a",
      "manifestUrl": "/days/location-a/day.json",
      "sceneIndex": 0
    },
    {
      "sceneId": "location-b",
      "manifestUrl": "/days/location-b/day.json",
      "sceneIndex": 0
    }
  ],
  "connections": [
    {
      "id": "a-to-b",
      "fromSceneId": "location-a",
      "toSceneId": "location-b",
      "legs": [
        {
          "mode": "tube",
          "line": "Central",
          "color": "#E32017",
          "stations": ["Start Station", "Interchange Station"],
          "durationMs": 4000
        },
        {
          "mode": "tube",
          "line": "Bakerloo",
          "color": "#B36305",
          "stations": ["Interchange Station", "Destination Station"],
          "durationMs": 4000
        }
      ],
      "departure": {
        "kind": "station",
        "label": "Start Station",
        "tile": { "x": 34, "y": 12 },
        "approach": { "x": 33, "y": 12 }
      },
      "arrival": {
        "kind": "station",
        "label": "Destination Station",
        "tile": { "x": 5, "y": 12 },
        "approach": { "x": 6, "y": 12 }
      }
    }
  ]
}
```

Omit `departure` and `arrival` to let the adapter choose safe points for 40×28 worlds. It prefers departure tile `(34,12)` with approach `(33,12)` and arrival tile `(5,12)` with approach `(6,12)`. When those points are blocked, it chooses a nearby reachable pair in the original spawn's connected component. It never clears a building, changes terrain or moves food. Supply explicit complete points for any other world size. If no reachable adjacent pair exists, composition fails with an error.

The handoff's `locations` entries are source references, not fields in the final game manifest. A consumer loads and validates each referenced manifest, then imports the requested scene.

```ts
import { parseDayManifest } from "../lib/day";
import { composeWorldItinerary, importWorldScene } from "../pipeline/compose-itinerary";

const scenes = await Promise.all(handoff.locations.map(async location => {
  const raw = await fetch(location.manifestUrl).then(response => response.json());
  const source = parseDayManifest(raw, raw.id);
  return importWorldScene(source, location.manifestUrl, location.sceneId, location.sceneIndex);
}));
const day = composeWorldItinerary({
  id: handoff.id,
  date: handoff.date,
  player: handoff.player,
  scenes,
  connections: handoff.connections,
});
// Save day as the new day's day.json. Publish referenced source assets before sharing it.
```

`importWorldScene(sourceDay, manifestUrl, sceneId, index = 0)` resolves imported sprites against their source manifest so combining separate generated locations does not break relative asset paths. Application-root library paths stay on the app. The player paths supplied to composition must likewise be absolute URLs or application-root paths if their PNGs belong to another day.

`composeWorldItinerary({ id, date, player, scenes, connections })` calls the adapter and validates the resulting complete manifest. To compose scenes that already have correct asset URLs directly, use:

```ts
import { attachJourneys } from "../lib/itinerary";
const { scenes: orderedScenes, journeys, transit } = attachJourneys(scenes, connections);
```

## Final manifest contract

The final `DayManifest` contains `scenes`, ordered `journeys`, and `transit: []`. Do not fill both `journeys` and legacy `transit`. A `Journey` has exactly the fields shown by the connection example; its `id`, `departure` and `arrival` are required in the final manifest.

A `TravelPoint` contains `kind`, `label`, `tile` and `approach`. Its tile and approach must be cardinal neighbours, in bounds, collision free, and reachable from that scene's spawn. The swept walking body between neighbours must also be clear: a thin fence between two clear tile centres still blocks movement. Scene spawn/exit and location geometry remain unchanged by composition. The runtime uses the arrival approach to place the character after travel.

| Leg mode | Required fields | Point kind |
| --- | --- | --- |
| `bus` | `route`, `destination`, `from`, `to` | `bus_stop` |
| `tube` | `line`, six-digit hex `color`, `stations` array of 2–32 stop names | `station` |
| `walk` | `from`, `to` | `path` |

Every leg can include integer `durationMs` from 1000 to 15000. A journey contains 1–24 legs. Consecutive leg endpoints must describe the same transfer stop. Tube endpoints are the first/last elements of `stations`; bus and walk endpoints are `from`/`to`. Departure kind and label match the first leg's mode and starting stop; arrival kind and label match the last leg's mode and ending stop. Stop comparison ignores letter case and repeated/leading/trailing whitespace, with Unicode normalization. It does not guess aliases for differently named stations.

The validator rejects missing connections, non-adjacent connections, duplicate IDs, mixed legacy/world scene sequences, disconnected transfer names, malformed modes, out-of-range durations, blocked points and unreachable anchors. It accepts an unchanged single-world day without scene IDs or journeys. It also accepts the original three-scene `tourist → meal → park` demo with its two legacy transit entries.

Geometry helpers in `lib/day.ts` are available for the provider's validation: `isSceneTileWalkable(scene, tile)`, `sceneCanStep(scene, from, to)` and `sceneReachableTiles(scene, from = scene.spawn)`. Reachability returns a `Set<string>` with keys such as `"34,12"`.
