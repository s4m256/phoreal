export const DAY_MS = 86_400_000;

/** @param {Date} date */
export const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** @param {Date} date */
export const dayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** @param {Date} date */
export const dayNumber = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;

/** @param {string} key */
export function parseDayKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * @param {Map<string, {seconds:number, problems:Map<number,number>}>} target
 * @param {Date} date
 * @param {number} seconds
 * @param {number} problemId
 */
function addDailySlice(target, date, seconds, problemId) {
  const key = dayKey(date);
  const entry = target.get(key) ?? { seconds: 0, problems: new Map(), completed: 0 };
  entry.seconds += seconds;
  entry.problems.set(problemId, (entry.problems.get(problemId) ?? 0) + seconds);
  target.set(key, entry);
}

/**
 * @param {string} startedAt
 * @param {number} seconds
 * @param {number} problemId
 * @param {Map<string, {seconds:number, problems:Map<number,number>}>} target
 */
export function splitSegmentByDay(startedAt, seconds, problemId, target) {
  let cursor = new Date(startedAt);
  const finish = new Date(cursor.getTime() + seconds * 1000);
  while (cursor < finish) {
    const nextDay = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    const boundary = nextDay < finish ? nextDay : finish;
    const slice = Math.max(0, Math.floor((boundary.getTime() - cursor.getTime()) / 1000));
    addDailySlice(target, cursor, slice, problemId);
    cursor = boundary;
  }
}

/**
 * @param {Date} start
 * @param {Date} end
 * @param {Map<string, {seconds:number, problems:Map<number,number>}>} daily
 * @param {number} now
 */
export function fixedPeriodDays(start, end, daily, now) {
  const today = dayStart(new Date(now));
  const days = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = new Date(cursor);
    const key = dayKey(date);
    days.push({ key, date, seconds: date > today ? null : daily.get(key)?.seconds ?? 0, questions: date > today ? null : daily.get(key)?.completed ?? 0 });
  }
  return days;
}

/** @param {string} code */
export function problemCodeOrder(code) {
  const group = code.startsWith("T") ? 0 : code.startsWith("E") ? 1 : code.startsWith("PE") ? 2 : 3;
  const number = Number(code.match(/\d+/)?.[0] ?? 0);
  return { group, number, code };
}

/** @param {string} a @param {string} b */
export function compareProblemCodes(a, b) {
  const left = problemCodeOrder(a);
  const right = problemCodeOrder(b);
  return left.group - right.group || left.number - right.number || left.code.localeCompare(right.code, "pt-BR");
}

export function isTheoryTag(name) {
  const value = String(name ?? "").trim();
  return value !== "" && !/^(?:X|Y|[XY]\d{2}|(?:19|20)\d{2})$/i.test(value);
}

export const PROBLEM_TIME_BUDGET_SECONDS = 2 * 60 * 60;

/**
 * Distributes the two-hour problem budget among items. Scores are used only
 * when every item has a reliable positive value; incomplete scores fall back
 * to equal shares so missing data cannot distort the targets.
 * @param {Array<{id:number,score:number|null}>} parts
 * @param {number} totalSeconds
 */
export function allocatePartTimeLimits(parts,totalSeconds=PROBLEM_TIME_BUDGET_SECONDS) {
  const result = new Map();
  if (!parts.length || totalSeconds <= 0) return result;
  const useScores = parts.every((part) => part.score != null && Number(part.score) > 0);
  const weights = parts.map((part) => useScores ? Number(part.score) : 1);
  const weightTotal = weights.reduce((sum,weight) => sum+weight,0);
  const allocations = parts.map((part,index) => {
    const exact = totalSeconds*weights[index]/weightTotal;
    return {id:part.id,seconds:Math.floor(exact),fraction:exact-Math.floor(exact),index};
  });
  let remainder = totalSeconds-allocations.reduce((sum,item) => sum+item.seconds,0);
  for (const item of [...allocations].sort((a,b) => b.fraction-a.fraction || a.index-b.index)) {
    if (remainder-- <= 0) break;
    item.seconds += 1;
  }
  for (const item of allocations) result.set(item.id,item.seconds);
  return result;
}
