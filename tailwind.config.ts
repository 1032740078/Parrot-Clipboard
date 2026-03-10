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
          bg: "var(--panel-bg)",
          border: "var(--panel-border)",
        },
      },
      spacing: {
        card: "18rem",
        panel: "24rem",
      },
      borderRadius: {
        panel: "16px",
      },
      boxShadow: {
        panel: "var(--panel-shadow)",
      },
    },
  },
  plugins: [],
};

export default config;
