/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          0: "#0f1117",
          1: "#1a1d27",
          2: "#21253a",
          3: "#2a2f47",
        },
        accent: {
          blue: "#4f8ef7",
          green: "#34d399",
          yellow: "#fbbf24",
          red: "#f87171",
          purple: "#a78bfa",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["SF Mono", "JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
