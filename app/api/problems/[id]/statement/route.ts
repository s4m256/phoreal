import { ensureDatabase, getD1 } from "../../../../../db/runtime";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await params;
  const problemId = Number(id);
  if (!Number.isInteger(problemId)) return Response.json({ error: "Problema inválido" }, { status: 400 });
  const row = await getD1().prepare(`
    SELECT p.statement_html_original,p.statement_html_pt,p.statement_status,p.statement_content_hash,
           p.translation_status,p.translation_source_hash
    FROM phors_problems p JOIN phors_exams e ON e.id=p.exam_id
    WHERE p.id=? AND e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026
  `).bind(problemId).first<{
    statement_html_original:string|null; statement_html_pt:string|null; statement_status:string;
    statement_content_hash:string|null; translation_status:string; translation_source_hash:string|null;
  }>();
  if (!row) return Response.json({ error: "Problema não encontrado" }, { status: 404 });
  const translated = ["draft", "verified"].includes(row.translation_status)
    && row.translation_source_hash === row.statement_content_hash
    && Boolean(row.statement_html_pt);
  return Response.json({
    html: translated ? row.statement_html_pt : row.statement_html_original,
    language: translated ? "pt-BR" : "ru",
    statementStatus: row.statement_status,
    translationStatus: row.translation_status,
    hasDraft: translated && row.translation_status === "draft",
  });
}
