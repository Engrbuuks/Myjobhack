import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0C0D11", "ink-2": "#14161C", "ink-3": "#1C1F27",
        coral: "#FC5647", "coral-soft": "#FFF1EF", "coral-deep": "#F04A3B",
        paper: "#FAFAF8", "paper-2": "#F2F1EC", bone: "#F2EFE9",
        muted: "#6E7180", "muted-2": "#9FA2AE", line: "#E8E6E1", "line-d": "rgba(255,255,255,.1)"
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
