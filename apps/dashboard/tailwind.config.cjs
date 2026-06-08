/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,ts,svelte}"],
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["night"],
    darkTheme: "night"
  }
};
