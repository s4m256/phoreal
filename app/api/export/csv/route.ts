import { readAllData } from "../../../../db/runtime";

const escapeCsv = (value: unknown) => `"${String(value ?? "").replaceAll('"','""')}"`;
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const data = await readAllData(); const requested = new URL(request.url).searchParams.get("table") ?? "attempts";
  const tables = { attempts: data.attempts, segments: data.timeSegments, mock_exams: data.mockExams, mock_scores: data.mockExamProblemScores } as const;
  const rows = tables[requested as keyof typeof tables];
  if (!rows) return Response.json({ error: "Tabela inválida" }, { status: 400 });
  const headers = rows.length ? Object.keys(rows[0] as Record<string, unknown>) : [];
  const csv = [headers.map(escapeCsv).join(","), ...rows.map((row) => headers.map((key) => escapeCsv((row as Record<string, unknown>)[key])).join(","))].join("\r\n");
  return new Response(`\uFEFF${csv}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="treino-${requested}.csv"` } });
}
