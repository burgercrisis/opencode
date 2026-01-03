/**
 * Application-wide constants and configuration
 */
export const config = {
  // Base URL
  baseUrl: "https://opencode.ai",

  // GitHub
  github: {
<<<<<<< HEAD
    repoUrl: "https://github.com/sst/opencode",
    starsFormatted: {
      compact: "41K",
      full: "41,000",
=======
    repoUrl: "https://github.com/anomalyco/opencode",
    starsFormatted: {
      compact: "45K",
      full: "45,000",
>>>>>>> upstream/dev
    },
  },

  // Social links
  social: {
    twitter: "https://x.com/opencode",
    discord: "https://discord.gg/opencode",
  },

  // Static stats (used on landing page)
  stats: {
<<<<<<< HEAD
    contributors: "450",
    commits: "6,000",
    monthlyUsers: "400,000",
=======
    contributors: "500",
    commits: "6,500",
    monthlyUsers: "650,000",
>>>>>>> upstream/dev
  },
} as const
