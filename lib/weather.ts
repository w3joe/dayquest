/** Designed weather for a scene. Never includes coordinates. */
export const WEATHER_CONDITIONS = ["clear", "cloudy", "rain", "drizzle", "snow", "fog", "storm"] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];
export const DAYLIGHT = ["day", "dusk", "night"] as const;
export type Daylight = (typeof DAYLIGHT)[number];
export type SceneWeather = { condition: WeatherCondition; tempC: number; daylight: Daylight };
export type WeatherQuery = { date: string; time: string; lat?: number; lng?: number; photo?: Buffer };

const LABELS: Record<WeatherCondition, string> = {
  clear: "CLEAR", cloudy: "OVERCAST", rain: "RAIN", drizzle: "DRIZZLE", snow: "SNOW", fog: "FOG", storm: "STORM",
};

export function weatherHud(weather: SceneWeather): string {
  return `${weather.tempC}°C ${LABELS[weather.condition]}`;
}

export function isWet(condition: WeatherCondition): boolean {
  return condition === "rain" || condition === "drizzle" || condition === "storm";
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strict manifest field: three designed values, or omit the field entirely. */
export function parseSceneWeather(value: unknown): SceneWeather {
  if (!record(value) || Object.keys(value).length !== 3 ||
    !WEATHER_CONDITIONS.includes(value.condition as WeatherCondition) ||
    !DAYLIGHT.includes(value.daylight as Daylight) ||
    typeof value.tempC !== "number" || !Number.isInteger(value.tempC) || value.tempC < -70 || value.tempC > 60) {
    throw new Error("Invalid scene weather");
  }
  return { condition: value.condition as WeatherCondition, tempC: value.tempC, daylight: value.daylight as Daylight };
}

/** WMO weather interpretation codes → the designed set. Unknown codes become cloudy. */
export function mapWeatherCode(code: number): WeatherCondition {
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) return "drizzle";
  if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67 || code === 80 || code === 81 || code === 82) return "rain";
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) return "snow";
  if (code === 95 || code === 96 || code === 99) return "storm";
  return "cloudy";
}

export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function clockFromIso(value: string): string | undefined {
  const match = /T(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : undefined;
}

/** Round 12:40 to 13:00 so it lines up with hourly Open-Meteo rows. */
export function nearestHour(time: string): string {
  const rounded = (Math.round(minutesOf(time) / 60) * 60) % (24 * 60);
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:00`;
}

export function sceneDaylight(time: string, isDay: number, sunrise?: string, sunset?: string): Daylight {
  if (isDay !== 1) return "night";
  const now = minutesOf(time);
  const set = sunset ? minutesOf(clockFromIso(sunset) ?? "12:00") : undefined;
  const rise = sunrise ? minutesOf(clockFromIso(sunrise) ?? "12:00") : undefined;
  if (set !== undefined && now >= set - 75 && now <= set + 20) return "dusk";
  if (rise !== undefined && now >= rise - 20 && now <= rise + 45) return "dusk";
  return "day";
}

export function nearestLocation<T extends { t: string; lat: number; lng: number }>(places: T[], time: string): T | undefined {
  if (!places.length) return undefined;
  const target = minutesOf(time);
  return places.reduce((best, place) =>
    Math.abs(minutesOf(place.t) - target) < Math.abs(minutesOf(best.t) - target) ? place : best);
}

export async function readPhotoGps(photo: Buffer): Promise<{ lat: number; lng: number } | undefined> {
  try {
    const { default: exifr } = await import("exifr");
    const gps = await exifr.gps(photo);
    if (!gps || typeof gps.latitude !== "number" || typeof gps.longitude !== "number") return undefined;
    if (Math.abs(gps.latitude) > 90 || Math.abs(gps.longitude) > 180) return undefined;
    return { lat: gps.latitude, lng: gps.longitude };
  } catch {
    return undefined;
  }
}

type Hourly = { time: string[]; temperature_2m: number[]; weather_code: number[]; is_day: number[] };
type Daily = { sunrise: string[]; sunset: string[] };

function pastDate(date: string): boolean {
  return date < new Date().toISOString().slice(0, 10);
}

export function openMeteoUrl(lat: number, lng: number, date: string): string {
  const host = pastDate(date) ? "https://archive-api.open-meteo.com/v1/archive" : "https://api.open-meteo.com/v1/forecast";
  const query = new URLSearchParams({
    latitude: String(lat), longitude: String(lng), start_date: date, end_date: date,
    hourly: "temperature_2m,weather_code,is_day", daily: "sunrise,sunset", timezone: "auto",
  });
  return `${host}?${query}`;
}

export function weatherAtHour(hourly: Hourly, daily: Daily | undefined, date: string, time: string): SceneWeather | undefined {
  const hour = `${date}T${nearestHour(time)}`;
  const index = hourly.time.findIndex(entry => entry.startsWith(hour));
  if (index < 0) return undefined;
  const temp = hourly.temperature_2m[index], code = hourly.weather_code[index], isDay = hourly.is_day[index];
  if (typeof temp !== "number" || typeof code !== "number" || typeof isDay !== "number") return undefined;
  return {
    condition: mapWeatherCode(code),
    tempC: Math.max(-70, Math.min(60, Math.round(temp))),
    daylight: sceneDaylight(time, isDay, daily?.sunrise[0], daily?.sunset[0]),
  };
}

const hoursCache = new Map<string, Promise<{ hourly: Hourly; daily?: Daily } | undefined>>();

async function fetchHours(lat: number, lng: number, date: string, get: typeof fetch): Promise<{ hourly: Hourly; daily?: Daily } | undefined> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${date}`;
  const pending = hoursCache.get(key);
  if (pending) return pending;
  const request = (async () => {
    try {
      const response = await get(openMeteoUrl(lat, lng, date), { signal: AbortSignal.timeout(4000) });
      if (!response.ok) return undefined;
      const body = await response.json() as { hourly?: Hourly; daily?: Daily };
      if (!body.hourly?.time || !body.hourly.temperature_2m || !body.hourly.weather_code || !body.hourly.is_day) return undefined;
      return { hourly: body.hourly, daily: body.daily };
    } catch {
      return undefined;
    }
  })();
  hoursCache.set(key, request);
  return request;
}

/** Never throws. Missing place, a failed call, or a bad payload all mean "no weather". */
export async function lookupSceneWeather(query: WeatherQuery, get: typeof fetch = fetch): Promise<SceneWeather | undefined> {
  const point = query.lat !== undefined && query.lng !== undefined
    ? { lat: query.lat, lng: query.lng }
    : query.photo ? await readPhotoGps(query.photo) : undefined;
  if (!point || !/^\d{4}-\d{2}-\d{2}$/.test(query.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(query.time)) return undefined;
  const hours = await fetchHours(point.lat, point.lng, query.date, get);
  if (!hours) return undefined;
  return weatherAtHour(hours.hourly, hours.daily, query.date, query.time);
}

/** Scripted demo beat from the ideas doc: rain, then a golden-hour clearing. */
export function scriptedDemoWeather(time: string, kind?: "tourist" | "meal" | "park"): SceneWeather | undefined {
  if (time === "10:00" || kind === "tourist") return { condition: "rain", tempC: 7, daylight: "day" };
  if (time === "12:40" || kind === "meal") return { condition: "drizzle", tempC: 8, daylight: "day" };
  if (time === "14:15" || kind === "park") return { condition: "clear", tempC: 10, daylight: "dusk" };
  return undefined;
}

export function weatherLookupForDay(input: { date: string; locations: { t: string; lat: number; lng: number }[] }, get: typeof fetch = fetch) {
  return async (scene: { time: string }): Promise<SceneWeather | undefined> => {
    const place = nearestLocation(input.locations, scene.time);
    if (!place) return undefined;
    return lookupSceneWeather({ date: input.date, time: scene.time, lat: place.lat, lng: place.lng }, get);
  };
}
