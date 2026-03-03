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
				'crimson': ['Crimson Text'],
				'roboto-slab': ["Roboto Slab", 'serif'],
				'playfair': ['Playfair Display'],
				'libre': ['Libre Franklin']
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