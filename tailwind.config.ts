import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light mode surface
        surface: {
          DEFAULT: "#ffffff",
          page: "#f8fafc",
          nav: "#0f172a",
          "nav-active": "#1e293b",
        },
        // Borders
        border: {
          DEFAULT: "#e2e8f0",
          strong: "#cbd5e1",
        },
        // Muted text
        muted: {
          DEFAULT: "#94a3b8",
          strong: "#64748b",
        },
      },
    },
  },
  plugins: [],
};

export default config;
