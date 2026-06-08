/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,ts,svelte}"],
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      {
        anomalist: {
          primary: "#7c3aed",
          "primary-content": "#ffffff",
          secondary: "#4f46e5",
          accent: "#06b6d4",
          neutral: "#1e1e2e",
          "base-100": "#13131f",
          "base-200": "#1a1a2e",
          "base-300": "#22223b",
          "base-content": "#e2e8f0",
          info: "#38bdf8",
          success: "#34d399",
          warning: "#fbbf24",
          error: "#f87171"
        }
      }
    ],
    darkTheme: "anomalist"
  }
};
