import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#007AFF",
          foreground: "#FFFFFF",
        },
        panel: {
          bg: "rgba(28, 28, 30, 0.72)",
          border: "rgba(255, 255, 255, 0.18)",
        },
      },
      spacing: {
        card: "18rem",
        panel: "13.75rem",
      },
      borderRadius: {
        panel: "16px",
      },
      boxShadow: {
        panel: "0 14px 40px rgba(0, 0, 0, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
