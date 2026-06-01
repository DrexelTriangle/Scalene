# Scalene
The Triangle Website, but like, React!



# Project Setup
- installed astro
- added tailwind to project
- added react-router-dom

## Local HTTPS Cert Trust
- `npm run dev`, `npm run build`, and `npm run preview` now auto-detect `localhost.crt` at:
  - `../triangle-cms/server/certs/localhost.crt`
  - `./triangle-cms/server/certs/localhost.crt`
- You can override the cert path with `LOCALHOST_CERT_PATH`.
- This makes Node's `fetch` trust the self-signed `triangle-cms` cert at `https://localhost:8080` during local development.

### Override cert path examples
- macOS/Linux:
  - `LOCALHOST_CERT_PATH=/full/path/to/localhost.crt npm run build`
- Windows cmd:
  - `set LOCALHOST_CERT_PATH=C:\full\path\to\localhost.crt&& npm run build`
- Windows PowerShell:
  - `$env:LOCALHOST_CERT_PATH='C:\full\path\to\localhost.crt'; npm run build`
