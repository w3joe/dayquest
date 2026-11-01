# Regent's Park: reference brief

Scene 3 of the day (SPEC.md day table): **14:15–15:30, Walk in Regent's Park**, base map `park`.
The day data (`data/input.json`) puts Shawn at Queen Mary's Gardens at 14:15, the Triton Fountain at 14:50 and the boating lake at 15:20, and logs one walk: **3.8 km, 75 min, 5,200 steps**.

Photos were used only as visual reference. None were downloaded or shipped.

## Real geography (what sits where)

- **Queen Mary's Gardens** fill the Inner Circle, a 1 km ring road in the middle of the park. ([Royal Parks, Regent's Park](https://www.royalparks.org.uk/visit/parks/regents-park-primrose-hill))
- **Jubilee Gates** are on the south side, off the Inner Circle near York Bridge, and are the main entrance to Queen Mary's Gardens. ([Royal Parks, monuments](https://www.royalparks.org.uk/visit/parks/regents-park-primrose-hill/monuments))
- From the gates a **broad central walk ("main alley") lined with benches** runs north to the **Triton Fountain**, passing mixed borders framed by beech hedges. Halfway up on the right is the Mediterranean Garden; the Begonia Garden is on the left. ([Friends of Regent's Park, Queen Mary's Gardens](https://www.friendsofregentspark.org/gardens/queen-marys-gardens))
- **Triton Fountain** stands in a round pool opposite the Jubilee Gates, at the end of the central walk. ([Royal Parks, monuments](https://www.royalparks.org.uk/visit/parks/regents-park-primrose-hill/monuments))
- **Rose beds**: 85 single-variety beds, mostly around the circular rose garden and along the walks. ([Friends of Regent's Park](https://www.friendsofregentspark.org/gardens/queen-marys-gardens), [Royal Parks, Queen Mary's Gardens](https://www.royalparks.org.uk/parks/the-regents-park/things-to-see-and-do/gardens-and-landscapes/queen-marys-gardens))
- **Boating lake** lies west of the Inner Circle, with islands where herons nest. ([Royal Parks, boat hire](https://www.royalparks.org.uk/visit/parks/regents-park-primrose-hill/boat-pedalo-hire))
- **Holme Green bandstand** is on Holme Green, the lawn between the boating lake and the Inner Circle. ([Royal Parks, monuments](https://www.royalparks.org.uk/visit/parks/regents-park-primrose-hill/monuments))

Visual references (looked at, not downloaded): Wikimedia Commons categories "Jubilee Gates (Regent's Park)", "Triton Fountain, Regent's Park", "Bandstand, Regent's Park" and "Boating lake, Regent's Park"; Historic England photo DD004642 of the fountain (https://historicengland.org.uk/images-books/photos/item/DD004642).

### What the photos show
- **Jubilee Gates:** black cast and wrought iron with gilded acanthus scrollwork and the George V cipher in the overthrow, concave plan, pale Portland stone piers with flaming urns, pedestrian gates either side of the carriage gates.
- **Triton Fountain:** dark bronze triton blowing a conch on a rock, two reclining mermaids at his feet, a jet of water, a low round stone-rimmed pool; rose beds and lawn around it.
- **Bandstand:** octagonal, dark green cast-iron columns, a dark pointed roof with a finial, a decorative frieze, on a low raised base with railings.
- **Boating lake:** wide calm water, low edges with grass running to the bank, weeping willows and big plane trees on the banks, swans, ducks and geese, blue/white hire boats at a jetty in season.

## Scene layout (bottom = south, player enters going north)

| Where | What | Status |
|---|---|---|
| Bottom centre | Jubilee Gates, spawn just inside them | real |
| Centre column | Gravel central walk running north, benches either side | real |
| Either side of the walk | Rose beds (`tile_roses`) and beech hedges | real (bed shapes simplified) |
| Top centre | Triton Fountain in a round pool on a gravel circle | real |
| Left third | Boating lake: water tiles (solid) with a grass bank (`tile_lake_edge`), swans, a rowing boat | real lake; exact shoreline and the boat are invented |
| Between lake and walk | Holme Green bandstand on the lawn | real (moved closer to the gardens) |
| Banks / lawns | Weeping willows by the water, plane trees (shared `tree`), deckchairs | willows/planes real; deckchair spots invented |
| Right edge | Park noticeboard with the walk stats, then the exit path to "HOME" | invented |

Compression: in reality the boating lake is outside the Inner Circle, a few hundred metres west of the central walk. The scene squeezes it in beside the gardens; the gap and the Inner Circle road are left out.

## Facts used in dialogue

| Fact | Source |
|---|---|
| Jubilee Gates mark George V's Silver Jubilee and the opening of Queen Mary's Gardens; given by Sigismund Goetze; Grade II listed (entry 1375642) | [Royal Parks, monuments](https://www.royalparks.org.uk/visit/parks/regents-park-primrose-hill/monuments); [Historic England 1375642](https://historicengland.org.uk/listing/the-list/list-entry/1375642) |
| The gates are dated 6 May 1935, the day Queen Mary reopened the remodelled gardens; iron partly gilded with George V's cipher, Portland stone pillars with flaming urns | [Historic England 1375642 (via British Listed Buildings)](https://britishlistedbuildings.co.uk/101375642-jubilee-gates-queen-marys-gardens-regents-park-ward) |
| About 12,000 roses in 85 single-variety beds (Royal Parks gives "approximately 8,000" roses; both agree on 85 beds). Dialogue uses "85 beds, each a single variety" to avoid the disputed count | [Friends of Regent's Park](https://www.friendsofregentspark.org/gardens/queen-marys-gardens); [Royal Parks, Queen Mary's Gardens](https://www.royalparks.org.uk/parks/the-regents-park/things-to-see-and-do/gardens-and-landscapes/queen-marys-gardens) |
| The rose garden was first planted in 1932 and completed in 1934 | [Royal Parks, Queen Mary's Gardens](https://www.royalparks.org.uk/parks/the-regents-park/things-to-see-and-do/gardens-and-landscapes/queen-marys-gardens) |
| Triton Fountain: bronze triton blowing a conch with two mermaids, by William McMillan; designed 1936, not put up until 1950 because of the war; given by Goetze's widow in his memory. (Royal Parks once credited William Reid Dick; the Historic England listing and Friends of Regent's Park say McMillan.) Listed as "Triton and Dryads Fountain", Grade II (1375637) | [Historic England 1375637](https://historicengland.org.uk/listing/the-list/list-entry/1375637); [Friends of Regent's Park, Triton Fountain](https://www.friendsofregentspark.org/statues/triton-fountain-queen-marys-gardens/); [Marylebone Journal](https://www.marylebonejournal.com/articles/the-triton-fountain-regents-park) |
| McMillan also made one of the Trafalgar Square fountains | [Royal Parks, monuments](https://www.royalparks.org.uk/visit/parks/regents-park-primrose-hill/monuments) |
| Holme Green bandstand was moved here from Richmond Park in the 1970s; a plaque on its base remembers seven army bandsmen killed by an IRA bomb during a concert on 20 July 1982 | [Royal Parks, monuments](https://www.royalparks.org.uk/visit/parks/regents-park-primrose-hill/monuments) |
| On 15 January 1867 the ice on the boating lake broke under about 200 of some 500 skaters; 40 people died. The lake was drained, its bed levelled and lined with concrete, and the depth cut to 4 ft (1.2 m) | [Wikipedia, Regent's Park skating disaster](https://en.wikipedia.org/wiki/Regent%27s_Park_skating_disaster) |
| Rowing boats and pedalos are hired on the lake, roughly late March to October; herons nest on the islands | [Royal Parks, boat hire](https://www.royalparks.org.uk/visit/parks/regents-park-primrose-hill/boat-pedalo-hire) |
| Walk: 3.8 km, 75 min, 5,200 steps, starting 14:15 at Queen Mary's Gardens | `data/input.json` (`workouts`, `locations`) |

The day is 7 November, after the boat-hire season, so the rowing boat on the water is marked invented.
