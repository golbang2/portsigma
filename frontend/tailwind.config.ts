import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#112031",
        mist: "#fbfaf6",
        ember: "#f97316",
        pine: "#0f766e"
      },
      boxShadow: {
        panel: "0 24px 48px rgba(17, 32, 49, 0.09)"
      }
    }
  },
  plugins: []
};

export default config;
