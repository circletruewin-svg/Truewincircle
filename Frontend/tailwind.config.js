/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" }, // Move left by half
        },
        // Parallax cloud layers for Aviator's flight arena. Two layers
        // moving at different speeds creates a depth illusion.
        cloudSlow: {
          "0%":   { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
        cloudFast: {
          "0%":   { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        marquee:      "marquee 15s linear infinite",
        "cloud-slow": "cloudSlow 80s linear infinite",
        "cloud-fast": "cloudFast 40s linear infinite",
      },
    },
  },
  plugins: [],
}