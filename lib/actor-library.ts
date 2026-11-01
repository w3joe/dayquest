import type { InteractEffect } from "./day";

export const ACTOR_DIR = "/tiles/dq/library/actors/";
export type Ground = "street" | "park" | "plaza";

export type LibraryActor = {
  id: string;
  name: string;
  role: "npc" | "interactable";
  /** Sprite size in world pixels; the file is exactly this size. */
  width: number;
  height: number;
  /** Interactables: which effects make sense for this sprite. */
  effects?: InteractEffect[];
  grounds: Ground[];
  /** Must stand right beside a path or paving (benches, lamps, machines): never floating in open lawn. */
  besidePath?: boolean;
  /** One line telling a model what this sprite looks like and what it is for. */
  hint: string;
  /** Prompt for the image API, appended to the shared isolated-object style. */
  art: string;
};

const all: Ground[] = ["street", "park", "plaza"];
const I = (id: string, name: string, width: number, height: number, effects: InteractEffect[], grounds: Ground[], hint: string, art: string): LibraryActor =>
  ({ id, name, role: "interactable", width, height, effects, grounds, hint, art });
const N = (id: string, name: string, width: number, height: number, grounds: Ground[], hint: string, art: string): LibraryActor =>
  ({ id, name, role: "npc", width, height, grounds, hint, art });

/** Generated once with scripts/generate-actor-library.mjs and committed. A model may only choose ids from this list; anything else triggers on-demand generation. */
export const ACTOR_LIBRARY: LibraryActor[] = [
  I("bell", "Little bell", 32, 40, ["ring"], all, "a brass bell on a post", "a small brass bell hanging from a short wooden post"),
  I("crossing_button", "Crossing button", 24, 40, ["press_button"], ["street", "plaza"], "a pedestrian crossing button on a pole", "a pedestrian crossing push-button box on a short metal pole"),
  I("bench", "Bench", 40, 28, ["sit"], all, "a wooden park bench", "a wooden park bench seen from the front, with a green metal frame"),
  I("lantern", "Lantern", 24, 48, ["toggle_lamp"], all, "an old-fashioned lantern that can light up", "a black iron lantern lamp-post with a glass lamp that is currently dark"),
  I("vending_machine", "Vending machine", 32, 44, ["press_button"], ["street", "plaza"], "a drinks vending machine with a button", "a small colourful drinks vending machine with a glowing button panel"),
  I("post_box", "Post box", 28, 40, ["ring", "press_button"], ["street", "plaza"], "a red post box", "a classic red pillar post box"),
  I("telescope", "Coin telescope", 28, 44, ["press_button"], ["park", "plaza"], "a viewing telescope on a stand", "a coin-operated viewing telescope on a metal stand"),
  I("jukebox", "Jukebox", 32, 44, ["press_button"], ["street", "plaza"], "a small jukebox", "a small retro jukebox with warm glowing lights"),
  I("leaf_pile", "Pile of leaves", 36, 24, ["shake_leaves"], ["park", "street"], "a heap of autumn leaves", "a loose heap of orange, red and gold autumn leaves"),
  I("bird_feeder", "Bird feeder", 28, 44, ["feed"], ["park", "plaza"], "a hanging bird feeder", "a wooden bird feeder on a pole with seeds and a tiny bird"),
  I("flower_bed", "Flower bed", 40, 24, ["shake_leaves", "pet"], ["park", "street", "plaza"], "a neat flower bed", "a small raised flower bed with bright mixed flowers"),
  I("wishing_well", "Wishing well", 36, 44, ["ring", "press_button"], ["park", "plaza"], "a stone wishing well", "a small round stone wishing well with a tiny wooden roof"),
  I("snowman", "Snowman", 28, 44, ["wave"], ["park", "plaza", "street"], "a friendly snowman", "a friendly little snowman with a scarf and carrot nose"),
  I("bike_bell", "Parked bicycle", 36, 32, ["ring"], ["street", "plaza"], "a bicycle with a bell", "a parked bicycle with a shiny bell on the handlebars"),
  N("chef", "Cook", 32, 48, ["street", "plaza"], "a cook in a white apron", "a friendly cook in a white apron and hat, standing, back to the viewer at an angle"),
  N("busker", "Busker", 32, 48, ["street", "plaza"], "a street musician with a guitar", "a street musician playing an acoustic guitar"),
  N("dog_walker", "Dog walker", 36, 48, all, "a person walking a dog", "a person walking a small dog on a lead"),
  N("child_balloon", "Child with balloon", 28, 44, ["park", "plaza", "street"], "a child holding a balloon", "a small child holding a red balloon"),
  N("cyclist", "Cyclist", 40, 44, ["street", "plaza"], "a person wheeling a bicycle", "a person wheeling a bicycle with a helmet"),
  N("tourist", "Visitor with camera", 32, 48, all, "a visitor taking a photo", "a visitor holding up a camera to take a photo"),
  N("jogger", "Jogger", 32, 48, ["park", "street"], "a person out for a run", "a jogger in bright running clothes mid-stride"),
  N("elderly_pair", "Couple on a stroll", 44, 48, ["park", "plaza", "street"], "two people strolling arm in arm", "an older couple strolling arm in arm"),
  N("florist", "Florist", 32, 48, ["street", "plaza"], "a florist with a bucket of flowers", "a florist holding a bucket of flowers"),
  N("barista", "Barista", 32, 48, ["street", "plaza"], "a barista carrying a coffee", "a barista in an apron carrying a takeaway coffee cup"),
  N("postie", "Postie", 32, 48, ["street", "plaza"], "a postal worker with a bag", "a postal worker with a satchel"),
  N("cat", "Cat", 24, 22, all, "a friendly cat", "a friendly cat sitting, tail curled"),
  N("dog", "Dog", 30, 24, all, "a friendly dog", "a friendly dog sitting with its tongue out"),
  N("pigeon", "Pigeon", 20, 18, ["street", "plaza", "park"], "a pigeon", "a plump pigeon"),
  N("swan", "Swan", 30, 28, ["park"], "a white swan", "a white swan with its neck curved"),
  N("duck", "Duck", 24, 22, ["park"], "a duck", "a friendly mallard duck"),
  N("squirrel", "Squirrel", 22, 24, ["park"], "a squirrel holding a nut", "a squirrel sitting up holding a nut"),
];

export const actorById = (id: string) => ACTOR_LIBRARY.find((actor) => actor.id === id);
export const actorSprite = (id: string) => `${ACTOR_DIR}${id}.png`;

const BESIDE_PATH = new Set(["bell", "crossing_button", "bench", "lantern", "vending_machine", "post_box", "jukebox", "telescope"]);
for (const actor of ACTOR_LIBRARY) if (BESIDE_PATH.has(actor.id)) actor.besidePath = true;
