# Catálogo pessoal de treino — Etapa 1

Esta etapa contém somente a integração reutilizável com o catálogo público [XY do pho.rs](https://xy.pho.rs/). Não há dashboard, cronômetro ou dados pessoais.

- investigação, estratégia e limitações: `docs/phors-integration.md`
- schema D1/SQLite: `db/schema.ts` e `db/migrations/0001_phors_catalog.sql`
- sincronizador: `scripts/sync-phors.mjs`
- amostra: `data/phors-sample.json`

```powershell
npm.cmd run test:phors
npm.cmd run phors:sample
```
