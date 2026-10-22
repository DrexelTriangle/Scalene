/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
	safelist: [
		"sm:grid-cols-3",
		"sm:grid-cols-4",
		"sm:grid-cols-2",
	],
	theme: {
		extend: {
			fontFamily: {
				// No 'crimson' token: Crimson Text was never loaded, so it only ever
				// resolved to the body serif its users already inherit.
				// Each family is followed by its metric-matched fallbacks (see the
				// end of src/styles/fonts.css), so swapping in the web font doesn't
				// shift the layout.
				'roboto-slab': ['Roboto Slab', 'Roboto Slab Fallback Noto Serif', 'Roboto Slab Fallback Georgia', 'Roboto Slab Fallback Times', 'serif'],
				'playfair': ['Playfair Display', 'Playfair Display Fallback Noto Serif', 'Playfair Display Fallback Georgia', 'Playfair Display Fallback Times', 'serif'],
				'libre': ['Libre Franklin', 'Libre Franklin Fallback Roboto', 'Libre Franklin Fallback Arial', 'sans-serif']
			},
			colors: {
				triangleBlue: '#2563EB',
				triangleGray: '#E5E7EB',
				triangleDark: '#1F2937',
				triangleDanger: '#b4041e',
				triangleSecondary: '#0C0A3E',
			}
		},
	},
	plugins: [],
}