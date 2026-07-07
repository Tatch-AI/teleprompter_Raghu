import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0b1220",
        panel: "#0f1830",
        panelSoft: "#131f3d",
      },
    },
  },
  plugins: [],
};

export default config;
