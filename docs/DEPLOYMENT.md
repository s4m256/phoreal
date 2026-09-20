# Public Cloudflare deployment

The existing Vinext/Vite Worker serves the app and binds Cloudflare D1 as `DB`.

```bash
npm ci
npm run deploy
```

The runtime creates the schema and imports the XY catalog metadata on first access. For a new D1 database, open `/problemas` and let initialization complete before restoring the statement content:

```bash
node scripts/prepare-public-statements.mjs
npx wrangler d1 execute phoreal --remote --config dist/server/wrangler.json --file work/public-statements.sql --yes
```

The preparation script extracts only statement/title updates from the two checked-in XY imports, validates them in an in-memory SQLite database, and checks 164 original statements. It neither reads nor writes personal training records. The SQL contains public corpus content, not a production database dump. Reapplying it restores the checked-in translation snapshot; review before replacing later editorial changes.

Verify the deployed corpus:

```bash
npx wrangler d1 execute phoreal --remote --config dist/server/wrangler.json --command "SELECT COUNT(*) AS problems, SUM(length(statement_html_original)>0) AS originals, SUM(length(statement_html_pt)>0) AS translations FROM phors_problems"
```

Expected: 165 index records, 164 originals, 164 translations. Source authorship is retained; translations are not certified mathematically exact.

The standalone Worker is anonymous and read-only for personal features. Incoming identity headers are ignored by default. `TRUST_AUTH_PROXY=true` is only for a deployment behind an identity-verifying proxy that strips client-supplied identity headers; do not enable it on a directly accessible public Worker. No new authentication provider is required for browsing.
