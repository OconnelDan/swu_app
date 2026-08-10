import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        space: {
          950: "#05070f",
          900: "#0b1021",
          800: "#121936",
          700: "#1b2547",
          600: "#28336a"
        },
        saber: {
          green: "#3ddc84",
          red: "#ff4d4f",
          yellow: "#facc15",
          blue: "#4da6ff"
        }
      },
      fontFamily: {
        display: ["'Orbitron'", "sans-serif"],
        body: ["'Inter'", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 20px rgba(77, 166, 255, 0.35)"
      }
    }
  },
  plugins: []
} satisfies Config;
