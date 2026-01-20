// Configuration loaded from environment variables
export const config = {
  port: parseInt(process.env.PORT || "3000"),
  baseUrl: process.env.BASE_URL || "http://localhost:3000",

  // OAuth providers (set these environment variables to enable)
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  },
};

export function isGithubEnabled(): boolean {
  return !!(config.github.clientId && config.github.clientSecret);
}

export function isGoogleEnabled(): boolean {
  return !!(config.google.clientId && config.google.clientSecret);
}
