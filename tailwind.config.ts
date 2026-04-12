import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["Sora", "Avenir Next", "Segoe UI", "sans-serif"],
        body: ["Manrope", "Avenir Next", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        atmosphere:
          "0 24px 60px rgba(4, 9, 24, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
      },
      backdropBlur: {
        glass: "18px",
      },
      animation: {
        breathe: "breathe 5s ease-in-out infinite",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { opacity: "0.65" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
