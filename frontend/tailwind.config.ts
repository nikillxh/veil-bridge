import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#08060d",
          900: "#0d0a16",
          800: "#150f1f",
          700: "#201829",
          600: "#2e2238",
        },
        // QIE logo palette: pink/magenta -> fuchsia -> purple -> indigo.
        brand: {
          50: "#fdeef7",
          200: "#f7b8dd",
          400: "#ee5fae",
          500: "#e8388f",
          600: "#c42a98",
        },
        iris: {
          400: "#b06fe6",
          500: "#9333ea",
          600: "#7c2bcf",
        },
        indigo: {
          400: "#7a6cf0",
          500: "#5b43d6",
          600: "#4a36b8",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        shimmer: "shimmer 2.4s linear infinite",
        float: "float 6s ease-in-out infinite",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};

export default config;
