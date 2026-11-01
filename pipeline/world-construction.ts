import { buildWorldKit, WORLD_KIT_REVISION } from "../lib/world-kit";
import { defaultTemplateFor, TEMPLATES } from "../game/layout-templates";
import { fallbackDesign } from "./world-design";
import type { SceneBlueprint } from "./scene-types";

/** Upgrade placement context without changing any photographed asset ID or description. */
export function prepareWorldConstruction(plan: SceneBlueprint): SceneBlueprint {
  const original = plan.template ?? defaultTemplateFor(plan.ground);
  const hasWater = (plan.composition?.ground ?? TEMPLATES[original].defaults.ground).some(op => op.op === "water");
  // A photographed waterfront object needs a shore; the legacy vision schema
  // could only choose street/park/plaza and therefore lost riverside context.
  const template = !hasWater && plan.props.some(prop => prop.usage?.area === "waterfront") ? "riverside" : original;
  const changed = template !== original;
  const prepared: SceneBlueprint = { ...plan, template,
    ...(changed ? { composition: undefined,
      ...(plan.design?.source === "fallback" ? { design: fallbackDesign(TEMPLATES[template].grounds[0], TEMPLATES[template].zones) } : {}),
    } : {}),
  };
  prepared.kit = buildWorldKit(prepared);
  return prepared;
}

export const needsConstructionUpgrade = (plan: SceneBlueprint) => plan.kit?.revision !== WORLD_KIT_REVISION;
