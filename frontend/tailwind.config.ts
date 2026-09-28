import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    // Add any other directories that contain Tailwind classes
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#059669",
          light: "#34d399",
          dark: "#047857",
        },
      },
    },
  },
  plugins: [],
};
export default config;