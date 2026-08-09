# Integração pho.rs XY — Etapa 1

## Fonte e estratégia

A única entrada aceita é uma página de prova de `https://xy.pho.rs/`, como `Y25`. A investigação curta não encontrou API, JSON embutido ou fonte pública mais simples. O HTML da prova já contém código, título, todas as tags, links T/S/M e anexos. As páginas de problema ligadas pelo XY contêm itens em elementos de rótulo próprios; quando existe pontuação, ela aparece em um `<sup>` do mesmo rótulo.

O sincronizador lê somente URLs de provas XY fornecidas explicitamente e as páginas de problema descobertas nelas. Ele é sequencial, espera no mínimo 1 segundo entre requisições, mantém cache por 24 horas, aceita respostas condicionais e não tenta autenticação ou contornar proteções. Como `robots.txt` não forneceu regras utilizáveis para a fonte, o comportamento foi deliberadamente conservador.

## Schema

As tabelas importadas usam prefixo `phors_`, deixando futuros dados pessoais em tabelas `user_` separadas:

- `phors_competitions`: uma fonte XY preservada por host/URL;
- `phors_exams`: código próprio (`W25`, `X24`, `Y25`), série `W/X/Y`, ano, título e URL;
- `phors_problems`: ID original, código, título, tipo, links e estado dos itens;
- `phors_problem_parts`: A1/A2/B1 etc., ordem, texto e pontuação anulável;
- `phors_tags` e `phors_problem_tags`: todas as tags e relação N:N;
- `phors_sync_runs`: auditoria mínima de cada atualização.

As chaves únicas em host, URL, ID original, item e relação de tag tornam a sincronização idempotente. Campos ausentes são nulos. A classificação teórica/experimental usa somente o código oficial T/E/PE; nenhuma IA participa.

## Itens e fallback

Itens são importados apenas quando o HTML usa o rótulo estruturado do pho.rs. A pontuação só é aceita quando aparece numericamente no `<sup>` do rótulo (`score_reliability = explicit_html`). Sem essa estrutura, o problema recebe `parts_status = not_available`; não há OCR ou leitura de PDF nesta etapa.

## Sincronizar

Uma prova:

```powershell
npm.cmd run phors:sync -- --export data/phors.json https://xy.pho.rs/Y25
```

Amostra limitada a duas questões por prova:

```powershell
npm.cmd run phors:sample
```

Use `--refresh` para ignorar o cache. O importador nunca descobre provas por crawling: cada URL XY deve ser passada explicitamente.
