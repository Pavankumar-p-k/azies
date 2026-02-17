/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        "terminal-bg": "#06110D",
        "terminal-elev": "#0A1914",
        "neon-green": "#43F4A7",
        "neon-red": "#F87171",
        "neon-amber": "#FBBF24"
      },
      boxShadow: {
        neon: "0 0 0.65rem rgba(67, 244, 167, 0.5)",
        panel: "0 18px 45px rgba(0, 0, 0, 0.35)"
      }
    }
  },
  plugins: []
};
