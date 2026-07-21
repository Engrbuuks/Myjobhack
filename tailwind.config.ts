import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Rebrand · Variant A "Deep Teal". Tokens keep their names so the
        // whole app re-skins from here — ink is now deep teal, paper is cool.
        ink: "#083E40", "ink-2": "#0C5A5D", "ink-3": "#124F52",
        coral: "#FC5647", "coral-soft": "#FFF1EF", "coral-deep": "#F04A3B",
        paper: "#F7FAFA", "paper-2": "#ECF4F3", bone: "#E4F1F0",
        teal: "#0C5A5D", "teal-deep": "#083E40", mint: "#CDE7E4",
        muted: "#4C6667", "muted-2": "#7C9694", line: "#DCEAE9", "line-d": "rgba(255,255,255,.12)"
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"]
      },
      borderRadius: { card: "18px", pill: "999px" }
    }
  },
  plugins: []
};
export default config;
