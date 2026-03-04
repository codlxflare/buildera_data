import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "Cascadia Code", "Source Code Pro", "Menlo", "Consolas", "monospace"],
        display: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        surface: {
          // Light minimalist palette (semantic mapping kept for compatibility)
          50: "#ffffff",
          100: "#0f172a",
          200: "#334155",
          700: "#e2e8f0",
          800: "#ffffff",
          900: "#f8fafc",
          950: "#f1f5f9",
        },
        accent: {
          DEFAULT: "#0ea5e9",
          light: "#38bdf8",
          dark: "#0284c7",
        },
        macro: {
          green: "#10b981",
          blue: "#0ea5e9",
          slate: "#475569",
        },
      },
      boxShadow: {
        glow: "0 0 24px -8px rgba(14, 165, 233, 0.25)",
        "glow-sm": "0 0 14px -8px rgba(14, 165, 233, 0.22)",
        card: "0 8px 24px -16px rgba(15, 23, 42, 0.22)",
        "card-hover": "0 12px 28px -16px rgba(15, 23, 42, 0.25)",
      },
      animation: {
        "fade-in": "fadeIn 0.35s ease-out",
        "slide-up": "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right": "slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        "bounce-dot": "bounceDot 1.2s infinite ease-in-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        bounceDot: {
          "0%, 80%, 100%": { transform: "scale(0.6)", opacity: "0.4" },
          "40%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
