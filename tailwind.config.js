/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  // "class" strategy: we auto-apply/remove "dark" class from <html>
  // based on window.matchMedia('prefers-color-scheme') — see App.tsx
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Surface colours are CSS-variable-driven so they switch automatically
        // between light and dark mode. See src/styles/index.css.
        surface: {
          0: "var(--surface-0)",
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        text: {
          primary:   "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted:     "var(--text-muted)",
        },
        border: {
          DEFAULT: "var(--border-color)",
        },
        accent: {
          blue:   "#4f8ef7",
          green:  "#34d399",
          yellow: "#fbbf24",
          red:    "#f87171",
          purple: "#a78bfa",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Display", "Segoe UI", "sans-serif"],
        mono: ["SF Mono", "JetBrains Mono", "Fira Code", "monospace"],
      },
      borderColor: {
        DEFAULT: "var(--border-color)",
      },
    },
  },
  plugins: [],
};
