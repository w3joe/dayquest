import type { Composition } from "../game/composition";
import { TEMPLATES, type TemplateId } from "../game/layout-templates";

/**
 * Worked examples for the composer: what a good scene looks like, in the kit's own vocabulary. They are shown to the model as few-shot
 * guidance and are also tested: every one must pass the structural checks and build a walkable world on its template.
 * Principles they demonstrate: organic shapes (blob, ellipse) rather than boxes, water edged by lawn and trees, paths that wander,
 * groups of odd numbers, asymmetry, and a calm open area kept clear around the route.
 */
export type Exemplar = { template: TemplateId; title: string; scene: string; composition: Composition };

export const EXEMPLARS: Exemplar[] = [
  { template: "garden", title: "Village green with a duck pond", scene: "A quiet village green: a pond on one side with grass around it, flower beds opposite, a hedge along the bottom and a few trees.",
    composition: TEMPLATES.garden.defaults },
  { template: "garden", title: "Walled flower garden", scene: "A formal walled garden: neat symmetrical flower beds either side of the middle path, a little round fish pond near the centre, hedges and clipped trees.",
    composition: {
      ground: [
        { op: "lawn", x: 0, y: 0, w: 40, h: 10, shape: "rect", flowers: 0.4 },
        { op: "bed", x: 6, y: 14, w: 9, h: 3, density: 0.7 }, { op: "bed", x: 6, y: 21, w: 9, h: 3, density: 0.7 },
        { op: "bed", x: 24, y: 14, w: 9, h: 3, density: 0.7 }, { op: "bed", x: 24, y: 22, w: 9, h: 3, density: 0.7 },
        { op: "water", x: 25, y: 17, w: 5, h: 4, shape: "ellipse" },
      ],
      features: [{ op: "row", kind: "hedge", from: [2, 26], to: [17, 26], spacing: 3 }, { op: "row", kind: "hedge", from: [22, 26], to: [37, 26], spacing: 3 }, { op: "place", kind: "tree", x: 4, y: 19 }, { op: "place", kind: "tree", x: 35, y: 19 }],
    } },
  { template: "garden", title: "Lakeside park", scene: "A park around a big lake: a wide organic lake in the lower left, open lawns, a grove of trees on the far side and a winding side path.",
    composition: {
      ground: [
        { op: "lawn", x: 0, y: 0, w: 40, h: 10, shape: "rect", flowers: 0.3 },
        { op: "water", x: 1, y: 14, w: 16, h: 12, shape: "blob" },
        { op: "path", points: [[21, 24], [28, 24], [34, 22]], width: 1, material: "p" },
        { op: "bed", x: 26, y: 14, w: 8, h: 3, density: 0.4 },
      ],
      features: [{ op: "grove", kind: "tree", cx: 32, cy: 15, count: 6, radius: 5 }, { op: "grove", kind: "tree", cx: 9, cy: 3, count: 4, radius: 4 }],
    } },
  { template: "plaza", title: "Market square", scene: "A paved market square with a cobbled border, planted beds in the corners, a row of bollards and trees at the edges.",
    composition: TEMPLATES.plaza.defaults },
  { template: "plaza", title: "Courtyard with a central lawn", scene: "A university-style courtyard: a cobbled path crossing the middle, a round lawn at the centre, trees at the corners.",
    composition: {
      ground: [
        { op: "paving", x: 10, y: 14, w: 20, h: 10, pattern: "cross", material: "c" },
        { op: "lawn", x: 14, y: 16, w: 5, h: 5, shape: "ellipse", flowers: 0.5 }, { op: "lawn", x: 21, y: 16, w: 5, h: 5, shape: "ellipse", flowers: 0.5 },
      ],
      features: [{ op: "place", kind: "tree", x: 4, y: 22 }, { op: "place", kind: "tree", x: 35, y: 22 }, { op: "row", kind: "lamp", from: [12, 25], to: [28, 25], spacing: 4 }],
    } },
  { template: "riverside", title: "Canal towpath", scene: "A canal running across the scene with a footbridge, a flowering bank on the far side and a hedge row.",
    composition: TEMPLATES.riverside.defaults },
  { template: "riverside", title: "River with a bend", scene: "A river that widens into a pool on the left, a tree-lined far bank and a lamp row along the near promenade.",
    composition: {
      ground: [
        { op: "water", x: 0, y: 14, w: 18, h: 6, shape: "rect" }, { op: "water", x: 22, y: 14, w: 18, h: 6, shape: "rect" },
        { op: "water", x: 2, y: 20, w: 7, h: 3, shape: "blob" },
        { op: "bed", x: 4, y: 24, w: 12, h: 3, density: 0.5 },
      ],
      features: [{ op: "row", kind: "tree", from: [3, 23], to: [37, 23], spacing: 6 }, { op: "row", kind: "lamp", from: [4, 11], to: [36, 11], spacing: 8 }],
    } },
  { template: "street", title: "Town high street", scene: "A busy high street: shopfronts, a crossing, trees and benches on the verges. The street's character comes from its buildings, so keep the scenery light.",
    composition: { ground: [{ op: "bed", x: 2, y: 22, w: 10, h: 2, density: 0.4 }], features: [{ op: "row", kind: "bollard", from: [14, 19], to: [26, 19], spacing: 4 }] } },
];
