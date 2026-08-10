import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Imported catalog tables use phors_. Personal data belongs in separate user_ tables.
export const competitions = sqliteTable("phors_competitions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceKey: text("source_key").notNull(), name: text("name").notNull(),
  sourceUrl: text("source_url").notNull(), sourceHost: text("source_host").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("phors_competitions_source_key_uq").on(t.sourceKey)]);

export const exams = sqliteTable("phors_exams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  competitionId: integer("competition_id").notNull().references(() => competitions.id, { onDelete: "cascade" }),
  sourceKey: text("source_key").notNull(), sourceUrl: text("source_url").notNull(),
  title: text("title").notNull(), titlePt: text("title_pt"), year: integer("year"), code: text("code"), series: text("series", { enum: ["W", "X", "Y"] }),
  sourceHash: text("source_hash").notNull(), importedAt: text("imported_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("phors_exams_source_url_uq").on(t.sourceUrl), index("phors_exams_competition_idx").on(t.competitionId)]);

export const problems = sqliteTable("phors_problems", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  examId: integer("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  sourceId: text("source_id").notNull(), sourceUrl: text("source_url").notNull(), code: text("code"),
  title: text("title").notNull(),
  titlePt: text("title_pt"),
  kind: text("kind", { enum: ["theoretical", "experimental", "unknown"] }).notNull().default("unknown"),
  statementUrl: text("statement_url"), solutionUrl: text("solution_url"),
  markingSchemeUrl: text("marking_scheme_url"), statementPdfUrl: text("statement_pdf_url"),
  solutionPdfUrl: text("solution_pdf_url"), attachmentsJson: text("attachments_json").notNull().default("[]"),
  statementHtmlSource: text("statement_html_source"),
  statementHtmlOriginal: text("statement_html_original"),
  statementTextOriginal: text("statement_text_original"),
  statementContentHash: text("statement_content_hash"),
  statementLanguage: text("statement_language").notNull().default("ru"),
  statementStatus: text("statement_status", { enum: ["public", "authentication_required", "not_available", "not_fetched"] }).notNull().default("not_fetched"),
  statementHtmlPt: text("statement_html_pt"),
  translationStatus: text("translation_status", { enum: ["missing", "draft", "verified"] }).notNull().default("missing"),
  translationSourceHash: text("translation_source_hash"),
  partsStatus: text("parts_status", { enum: ["structured", "not_available", "not_fetched"] }).notNull().default("not_fetched"),
  sourceHash: text("source_hash").notNull(), importedAt: text("imported_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("phors_problems_source_id_uq").on(t.sourceId), uniqueIndex("phors_problems_source_url_uq").on(t.sourceUrl), index("phors_problems_exam_idx").on(t.examId)]);

export const problemParts = sqliteTable("phors_problem_parts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  problemId: integer("problem_id").notNull().references(() => problems.id, { onDelete: "cascade" }),
  sourceKey: text("source_key").notNull(), code: text("code").notNull(), parentCode: text("parent_code"),
  ordinal: integer("ordinal").notNull(), score: real("score"),
  scoreReliability: text("score_reliability", { enum: ["explicit_html"] }),
  promptText: text("prompt_text"), promptTextPt: text("prompt_text_pt"), sourceUrl: text("source_url").notNull(),
}, (t) => [uniqueIndex("phors_problem_parts_problem_source_uq").on(t.problemId, t.sourceKey), index("phors_problem_parts_problem_idx").on(t.problemId)]);

export const tags = sqliteTable("phors_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), namePt: text("name_pt"), normalizedName: text("normalized_name").notNull(),
}, (t) => [uniqueIndex("phors_tags_normalized_name_uq").on(t.normalizedName)]);

export const problemTags = sqliteTable("phors_problem_tags", {
  problemId: integer("problem_id").notNull().references(() => problems.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.problemId, t.tagId] }), index("phors_problem_tags_tag_idx").on(t.tagId)]);

export const syncRuns = sqliteTable("phors_sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }), startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  status: text("status", { enum: ["running", "succeeded", "failed"] }).notNull().default("running"),
  examUrlsJson: text("exam_urls_json").notNull(), statsJson: text("stats_json").notNull().default("{}"),
  errorText: text("error_text"),
});

export const userSettings = sqliteTable("user_settings", {
  id: integer("id").primaryKey(),
  tbfDate: text("tbf_date"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const attempts = sqliteTable("user_attempts", {
  id: text("id").primaryKey(),
  problemId: integer("problem_id").notNull().references(() => problems.id),
  status: text("status", { enum: ["in_progress", "completed"] }).notNull(),
  currentState: text("current_state", { enum: ["initial_reading", "item_active", "paused"] }).notNull(),
  activePartId: integer("active_part_id").references(() => problemParts.id),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("user_attempts_problem_idx").on(t.problemId), index("user_attempts_status_idx").on(t.status)]);

export const timeSegments = sqliteTable("user_time_segments", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
  state: text("state", { enum: ["initial_reading", "item_active"] }).notNull(),
  problemPartId: integer("problem_part_id").references(() => problemParts.id),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  durationSeconds: integer("duration_seconds"),
}, (t) => [index("user_time_segments_attempt_idx").on(t.attemptId), index("user_time_segments_part_idx").on(t.problemPartId)]);

export const mockExams = sqliteTable("user_mock_exams", {
  id: text("id").primaryKey(),
  examId: integer("exam_id").notNull().references(() => exams.id),
  date: text("date").notNull(),
  type: text("type", { enum: ["theoretical", "experimental"] }).notNull(),
  totalScore: real("total_score").notNull(),
  maxScore: real("max_score").notNull(),
  driveUrl: text("drive_url"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("user_mock_exams_date_idx").on(t.date)]);

export const mockExamProblemScores = sqliteTable("user_mock_exam_problem_scores", {
  id: text("id").primaryKey(),
  mockExamId: text("mock_exam_id").notNull().references(() => mockExams.id, { onDelete: "cascade" }),
  problemId: integer("problem_id").notNull().references(() => problems.id),
  score: real("score").notNull(),
  maxScore: real("max_score").notNull(),
}, (t) => [uniqueIndex("user_mock_problem_uq").on(t.mockExamId, t.problemId), index("user_mock_scores_problem_idx").on(t.problemId)]);

export const mockExamsV2 = sqliteTable("user_mock_exams_v2", {
  id: text("id").primaryKey(), examName: text("exam_name").notNull(), date: text("date").notNull(),
  type: text("type", { enum:["theoretical","experimental"] }).notNull(), totalScore: real("total_score").notNull(),
  driveUrl: text("drive_url"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("user_mock_exams_v2_date_idx").on(t.date)]);

export const mockExamProblemScoresV2 = sqliteTable("user_mock_exam_problem_scores_v2", {
  id: text("id").primaryKey(), mockExamId: text("mock_exam_id").notNull().references(() => mockExamsV2.id, { onDelete:"cascade" }),
  problemNumber: integer("problem_number").notNull(), problemLabel: text("problem_label"), score: real("score").notNull(),
}, (t) => [uniqueIndex("user_mock_scores_v2_number_uq").on(t.mockExamId,t.problemNumber)]);

export const experiments = sqliteTable("user_experiments", {
  id:text("id").primaryKey(), title:text("title").notNull(), date:text("date"), imageUrl:text("image_url"), notes:text("notes"),
  createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("user_experiments_date_idx").on(t.date)]);
