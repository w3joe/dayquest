import type { NextConfig } from "next";

const config: NextConfig = {
  turbopack: { root: process.cwd() },
  allowedDevOrigins: ["127.0.0.1", ...(process.env.DAYQUEST_DEV_ORIGINS ?? "").split(",").map(host => host.trim()).filter(Boolean)],
};
export default config;
