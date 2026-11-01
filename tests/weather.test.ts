import assert from "node:assert/strict";
import test from "node:test";
import { sceneCaption, seedWeatherParticles, tickWeatherParticles } from "../game/weather";
import {
  lookupSceneWeather, mapWeatherCode, nearestHour, nearestLocation, openMeteoUrl, parseSceneWeather,
  sceneDaylight, scriptedDemoWeather, weatherAtHour, weatherHud, weatherLookupForDay,
} from "../lib/weather";
import { parseDayManifest } from "../lib/day";

function hourly() {
  return {
    time: ["2026-11-07T10:00", "2026-11-07T13:00", "2026-11-07T16:00"],
    temperature_2m: [7.4, 8.2, 6.6],
    weather_code: [61, 3, 0],
    is_day: [1, 1, 0],
  };
}

test("maps WMO codes onto the designed condition set", () => {
  assert.equal(mapWeatherCode(0), "clear");
  assert.equal(mapWeatherCode(3), "cloudy");
  assert.equal(mapWeatherCode(45), "fog");
  assert.equal(mapWeatherCode(51), "drizzle");
  assert.equal(mapWeatherCode(61), "rain");
  assert.equal(mapWeatherCode(71), "snow");
  assert.equal(mapWeatherCode(95), "storm");
  assert.equal(mapWeatherCode(1234), "cloudy");
});

test("daylight uses sunset proximity and is_day, and hours round to Open-Meteo rows", () => {
  assert.equal(nearestHour("12:40"), "13:00");
  assert.equal(nearestHour("14:15"), "14:00");
  assert.equal(sceneDaylight("15:30", 1, "2026-11-07T07:05", "2026-11-07T16:23"), "dusk");
  assert.equal(sceneDaylight("14:15", 1, "2026-11-07T07:05", "2026-11-07T16:23"), "day");
  assert.equal(sceneDaylight("18:00", 0, "2026-11-07T07:05", "2026-11-07T16:23"), "night");
});

test("picks the nearest stop and builds an archive URL for past dates", () => {
  const places = [
    { t: "10:00", lat: 51.5, lng: -0.12, label: "a" },
    { t: "12:40", lat: 51.51, lng: -0.13, label: "b" },
  ];
  assert.equal(nearestLocation(places, "12:30")?.label, "b");
  assert.match(openMeteoUrl(51.5, -0.12, "2020-01-01"), /archive-api\.open-meteo\.com/);
  assert.match(openMeteoUrl(51.5, -0.12, "2099-01-01"), /api\.open-meteo\.com\/v1\/forecast/);
});

test("hourly payload becomes a small weather object with no coordinates", () => {
  const weather = weatherAtHour(hourly(), { sunrise: ["2026-11-07T07:05"], sunset: ["2026-11-07T16:23"] }, "2026-11-07", "10:00");
  assert.deepEqual(weather, { condition: "rain", tempC: 7, daylight: "day" });
  assert.equal(weatherHud(weather!), "7°C RAIN");
  assert.equal(sceneCaption("10:00", "Touring Westminster", weather), "10:00 · Touring Westminster · 7°C RAIN");
});

test("Open-Meteo lookup uses one hourly row and never throws", async () => {
  const calls: string[] = [];
  const get = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return Response.json({ hourly: hourly(), daily: { sunrise: ["2026-11-07T07:05"], sunset: ["2026-11-07T16:23"] } });
  }) as typeof fetch;
  const weather = await lookupSceneWeather({ date: "2026-11-07", time: "10:00", lat: 51.5007, lng: -0.1246 }, get);
  assert.equal(weather?.condition, "rain");
  assert.equal(await lookupSceneWeather({ date: "2026-11-07", time: "10:00" }, get), undefined);
  const down = (async () => { throw new Error("offline"); }) as typeof fetch;
  assert.equal(await lookupSceneWeather({ date: "2026-11-07", time: "10:00", lat: 51.4, lng: -0.1 }, down), undefined);
  const day = weatherLookupForDay({ date: "2026-11-07", locations: [{ t: "10:00", lat: 51.5, lng: -0.12 }] }, get);
  assert.equal((await day({ time: "10:05" }))?.tempC, 7);
  assert.ok(calls[0]?.includes("latitude=51.5007"));
});

test("scripted demo weather is rain then a dusk clearing", () => {
  assert.deepEqual(scriptedDemoWeather("10:00", "tourist"), { condition: "rain", tempC: 7, daylight: "day" });
  assert.deepEqual(scriptedDemoWeather("12:40", "meal"), { condition: "drizzle", tempC: 8, daylight: "day" });
  assert.deepEqual(scriptedDemoWeather("14:15", "park"), { condition: "clear", tempC: 10, daylight: "dusk" });
});

test("falling weather seeds particles that wrap the view", () => {
  const rain = seedWeatherParticles({ condition: "rain", tempC: 7, daylight: "day" }, 320, 240);
  assert.ok(rain.length > 10);
  const first = rain[0].y;
  tickWeatherParticles(rain, 1000, 320, 240, { condition: "rain", tempC: 7, daylight: "day" });
  assert.notEqual(rain[0].y, first);
  assert.equal(seedWeatherParticles({ condition: "clear", tempC: 10, daylight: "dusk" }, 320, 240).length, 0);
});

test("manifests accept designed weather and reject extra or malformed fields", () => {
  const valid = parseSceneWeather({ condition: "rain", tempC: 7, daylight: "day" });
  assert.equal(valid.condition, "rain");
  assert.throws(() => parseSceneWeather({ condition: "hail", tempC: 7, daylight: "day" }));
  assert.throws(() => parseSceneWeather({ condition: "rain", tempC: 7.4, daylight: "day" }));
  assert.throws(() => parseSceneWeather({ condition: "rain", tempC: 7, daylight: "day", lat: 51.5 }));
  const day = {
    id: "demo", date: "2026-11-07", player: { name: "LUCAS", sprite: "player.png" },
    scenes: ["tourist", "meal", "park"].map((kind, index) => ({
      kind, title: kind, time: "10:00", base: ["city", "street", "park"][index],
      spawn: { x: 10, y: 13 }, exit: { x: 19, y: 12 },
      landmarks: [0, 1, 2].map(slot => ({ name: `L${slot}`, sprite: `s${index}_l${slot}.png`, footprint: "S", slot, text: "Here." })),
      weather: { condition: "rain", tempC: 7, daylight: "day" },
    })),
    transit: [0, 1].map(() => ({ legs: [{ mode: "bus", route: "24", destination: "Heath", from: "A", to: "B" }] })),
  };
  assert.equal(parseDayManifest(day, "demo").scenes[0].weather?.condition, "rain");
  day.scenes[0].weather = { condition: "rain", tempC: 7, daylight: "noon" } as never;
  assert.throws(() => parseDayManifest(day, "demo"));
});
