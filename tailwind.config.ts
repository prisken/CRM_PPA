import type { Config } from "tailwindcss";

const config: Config = {
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
      },
      colors: {
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f1f5f9",
          subtle: "#f8fafc",
        },
        content: {
          DEFAULT: "#0f172a",
          secondary: "#475569",
          muted: "#94a3b8",
        },
        accent: {
          DEFAULT: "#0071e3",
          hover: "#0077ed",
          soft: "#e8f2ff",
        },
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
      },
      boxShadow: {
        soft: "0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        card: "0 4px 16px 0 rgb(0 0 0 / 0.06), 0 1px 4px 0 rgb(0 0 0 / 0.04)",
        elevated:
          "0 8px 30px 0 rgb(0 0 0 / 0.08), 0 2px 8px 0 rgb(0 0 0 / 0.04)",
      },
    },
  },
};

export default config;
