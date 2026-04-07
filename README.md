# Scalene
The Triangle Website, but like, React!



# Project Setup
- installed astro
- added tailwind to project
- added react-router-dom

## Local HTTPS Cert Trust
- `npm run dev`, `npm run build`, and `npm run preview` now set `NODE_EXTRA_CA_CERTS=../triangle-cms/server/certs/localhost.crt`.
- This makes Node's `fetch` trust the self-signed `triangle-cms` cert at `https://localhost:8080` during local development.
