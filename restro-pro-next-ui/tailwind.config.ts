import type { Config } from "tailwindcss";

// Same palette/typography as the earlier HTML prototype, ported to Tailwind tokens
// so any pages migrated from it keep visual continuity.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        chili: { 300:"#F2A075",400:"#E86B3E",500:"#D9481F",600:"#B8391A" },
        basil: { 400:"#5C9273",500:"#3F6E52",600:"#2E5A41" },
        turmeric: { 400:"#E0B662",500:"#C99A3E" },
        crimson: { 400:"#D25861",500:"#B7383F" },
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        body: ["Public Sans", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
