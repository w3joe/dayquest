import { isWet, weatherHud, type SceneWeather } from "@/lib/weather";

export type WeatherParticle = { x: number; y: number; v: number; drift: number };

const GRADES: Record<string, { fill: string; alpha: number }> = {
  "clear:dusk": { fill: "#e8893a", alpha: 0.2 },
  "clear:night": { fill: "#12162c", alpha: 0.42 },
  "cloudy:day": { fill: "#6d7788", alpha: 0.2 },
  "cloudy:dusk": { fill: "#8a6a52", alpha: 0.24 },
  "cloudy:night": { fill: "#1a1e2c", alpha: 0.46 },
  "rain:day": { fill: "#3d4a5c", alpha: 0.26 },
  "rain:dusk": { fill: "#3a3548", alpha: 0.3 },
  "rain:night": { fill: "#12141f", alpha: 0.5 },
  "drizzle:day": { fill: "#546070", alpha: 0.2 },
  "drizzle:dusk": { fill: "#4a4558", alpha: 0.26 },
  "drizzle:night": { fill: "#161822", alpha: 0.48 },
  "snow:day": { fill: "#c5d4e4", alpha: 0.16 },
  "snow:dusk": { fill: "#8aa0b8", alpha: 0.22 },
  "snow:night": { fill: "#1c2434", alpha: 0.4 },
  "fog:day": { fill: "#c8c4b8", alpha: 0.28 },
  "fog:dusk": { fill: "#9a9084", alpha: 0.3 },
  "fog:night": { fill: "#2a2c34", alpha: 0.42 },
  "storm:day": { fill: "#2c3344", alpha: 0.34 },
  "storm:dusk": { fill: "#262030", alpha: 0.38 },
  "storm:night": { fill: "#0c0e16", alpha: 0.56 },
};

export function sceneCaption(time: string, title: string, weather?: SceneWeather): string {
  return weather ? `${time} · ${title} · ${weatherHud(weather)}` : `${time} · ${title}`;
}

export function seedWeatherParticles(weather: SceneWeather | undefined, width: number, height: number): WeatherParticle[] {
  if (!weather) return [];
  const falling = weather.condition === "rain" || weather.condition === "drizzle" || weather.condition === "storm" || weather.condition === "snow";
  if (!falling) return [];
  const count = weather.condition === "storm" ? 70 : weather.condition === "rain" ? 48 : weather.condition === "snow" ? 28 : 32;
  return Array.from({ length: count }, (_, i) => ({
    x: (i * 47 + 13) % width, y: (i * 31) % height,
    v: weather.condition === "snow" ? 0.035 + (i % 5) * 0.008 : 0.22 + (i % 7) * 0.04,
    drift: weather.condition === "snow" ? 0.02 : 0.06,
  }));
}

export function tickWeatherParticles(particles: WeatherParticle[], dt: number, width: number, height: number, weather?: SceneWeather): void {
  if (!weather) return;
  const snow = weather.condition === "snow";
  for (const particle of particles) {
    particle.y += particle.v * dt;
    particle.x += (snow ? Math.sin(particle.y / 18) * particle.drift : particle.drift) * dt;
    if (particle.y > height) { particle.y -= height; particle.x = (particle.x + width * 0.37) % width; }
    if (particle.x > width) particle.x -= width;
    if (particle.x < 0) particle.x += width;
  }
}

export function drawWeather(
  ctx: CanvasRenderingContext2D,
  weather: SceneWeather | undefined,
  particles: WeatherParticle[],
  width: number,
  height: number,
  player: { x: number; y: number },
): void {
  if (!weather) return;
  if (isWet(weather.condition)) {
    ctx.fillStyle = "rgba(18,28,42,.14)";
    ctx.fillRect(0, 0, width, height);
  }
  const grade = GRADES[`${weather.condition}:${weather.daylight}`];
  if (grade) {
    ctx.fillStyle = grade.fill;
    ctx.globalAlpha = grade.alpha;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }
  if (weather.daylight === "night") {
    const glow = ctx.createRadialGradient(player.x, player.y - 20, 12, player.x, player.y - 20, 90);
    glow.addColorStop(0, "rgba(255, 214, 140, 0.22)");
    glow.addColorStop(1, "rgba(255, 214, 140, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }
  if (weather.condition === "fog") {
    ctx.fillStyle = "rgba(230,228,220,.12)";
    ctx.fillRect(0, 0, width, height);
  }
  const snow = weather.condition === "snow";
  ctx.strokeStyle = snow ? "rgba(255,255,255,.85)" : "rgba(186,206,224,.55)";
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.lineWidth = weather.condition === "storm" ? 1.4 : 1;
  for (const particle of particles) {
    if (snow) {
      ctx.fillRect(Math.round(particle.x), Math.round(particle.y), 2, 2);
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(particle.x, particle.y);
    ctx.lineTo(particle.x + 1.4, particle.y + (weather.condition === "drizzle" ? 5 : 8));
    ctx.stroke();
  }
}
