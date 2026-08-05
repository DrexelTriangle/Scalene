// Tailwind is wired through PostCSS rather than @astrojs/tailwind, which is
// deprecated and peers only up to Astro 5. Astro picks this file up natively,
// and src/styles/global.css keeps its @tailwind directives, so the generated
// CSS is identical to what the integration produced.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
