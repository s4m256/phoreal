const UNIT_TEX = {
  "ТГц":"\\mathrm{THz}", "ГГц":"\\mathrm{GHz}", "МГц":"\\mathrm{MHz}", "кГц":"\\mathrm{kHz}", "Гц":"\\mathrm{Hz}",
  "ГПа":"\\mathrm{GPa}", "МПа":"\\mathrm{MPa}", "кПа":"\\mathrm{kPa}", "Па":"\\mathrm{Pa}", "атм":"\\mathrm{atm}",
  "МОм":"\\mathrm{M}\\Omega", "кОм":"\\mathrm{k}\\Omega", "мОм":"\\mathrm{m}\\Omega", "Ом":"\\Omega",
  "мкГн":"\\mu\\mathrm{H}", "мГн":"\\mathrm{mH}", "Гн":"\\mathrm{H}",
  "мкФ":"\\mu\\mathrm{F}", "нФ":"\\mathrm{nF}", "пФ":"\\mathrm{pF}", "Ф":"\\mathrm{F}",
  "мкТл":"\\mu\\mathrm{T}", "Тл":"\\mathrm{T}",
  "мкА":"\\mu\\mathrm{A}", "мА":"\\mathrm{mA}", "пА":"\\mathrm{pA}", "А":"\\mathrm{A}",
  "кВ":"\\mathrm{kV}", "мВ":"\\mathrm{mV}", "В":"\\mathrm{V}",
  "мкВт":"\\mu\\mathrm{W}", "мВт":"\\mathrm{mW}", "Вт":"\\mathrm{W}",
  "МДж":"\\mathrm{MJ}", "Дж":"\\mathrm{J}", "МэВ":"\\mathrm{MeV}",
  "мкм":"\\mu\\mathrm{m}", "нм":"\\mathrm{nm}", "км":"\\mathrm{km}", "см":"\\mathrm{cm}", "мм":"\\mathrm{mm}", "м":"\\mathrm{m}",
  "мкс":"\\mu\\mathrm{s}", "нс":"\\mathrm{ns}", "мс":"\\mathrm{ms}", "с":"\\mathrm{s}",
  "ммоль":"\\mathrm{mmol}", "моль":"\\mathrm{mol}", "кг":"\\mathrm{kg}", "мг":"\\mathrm{mg}", "г":"\\mathrm{g}", "т":"\\mathrm{t}",
  "мл":"\\mathrm{mL}", "л":"\\mathrm{L}", "Кл":"\\mathrm{C}", "кН":"\\mathrm{kN}", "Н":"\\mathrm{N}", "К":"\\mathrm{K}",
  "мин":"\\mathrm{min}", "рад":"\\mathrm{rad}", "год":"\\mathrm{yr}", "года":"\\mathrm{yr}", "дней":"\\mathrm{d}", "сут":"\\mathrm{d}",
};

const UNIT_TEXT = {
  "ТГц":"THz", "ГГц":"GHz", "МГц":"MHz", "кГц":"kHz", "Гц":"Hz",
  "ГПа":"GPa", "МПа":"MPa", "кПа":"kPa", "Па":"Pa", "атм":"atm",
  "МОм":"MΩ", "кОм":"kΩ", "мОм":"mΩ", "Ом":"Ω",
  "мкГн":"µH", "мГн":"mH", "Гн":"H", "мкФ":"µF", "нФ":"nF", "пФ":"pF", "Ф":"F",
  "мкТл":"µT", "Тл":"T", "мкА":"µA", "мА":"mA", "пА":"pA", "А":"A",
  "кВ":"kV", "мВ":"mV", "В":"V", "мкВт":"µW", "мВт":"mW", "Вт":"W",
  "МДж":"MJ", "Дж":"J", "МэВ":"MeV", "мкм":"µm", "нм":"nm", "км":"km", "см":"cm", "мм":"mm", "м":"m",
  "мкс":"µs", "нс":"ns", "мс":"ms", "с":"s", "ммоль":"mmol", "моль":"mol", "кг":"kg", "мг":"mg", "г":"g", "т":"t",
  "мл":"mL", "л":"L", "Кл":"C", "кН":"kN", "Н":"N", "К":"K", "мин":"min", "рад":"rad", "год":"ano", "года":"anos", "дней":"dias", "сут":"dias",
};

const unitAlternation = Object.keys(UNIT_TEX)
  .sort((a,b) => b.length-a.length)
  .map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))
  .join("|");
const unitPattern = new RegExp(`(^|[~\\s=+\\-*/^_{}()[\\],.;:·\\\\])(${unitAlternation})(?=$|[~\\s=+\\-*/^_{}()[\\],.;:·\\\\])`,"gu");
const cyrillicPattern = /[А-Яа-яЁё]+/gu;

function replaceUnitTokens(value) {
  return value.replace(unitPattern,(_match,prefix,unit) => `${prefix}{${UNIT_TEX[unit]}}`);
}

export function normalizePhysicsUnits(formula) {
  let normalized = formula.replace(/\\(?:text|mathrm)\{([^{}]*)\}/g,(whole,content) => {
    if (!/[А-Яа-яЁё]/u.test(content)) return whole;
    const prepared = content
      .replace(/мм\.\s*рт\.\s*ст\.?/gu,"\\mathrm{mmHg}")
      .replace(/\bв\s+(?=Тл\b)/gu,"");
    const mathUnits = replaceUnitTokens(prepared);
    if (!/[А-Яа-яЁё]/u.test(mathUnits)) return mathUnits;
    const translated = prepared.replace(cyrillicPattern,(token) => UNIT_TEXT[token] || token);
    return whole.replace(content,translated);
  });
  normalized = normalized.replace(/\\(?:text|mathrm)\s+([А-Яа-яЁё]+)/gu,(whole,unit) => UNIT_TEX[unit] ? `{${UNIT_TEX[unit]}}` : whole);
  return replaceUnitTokens(normalized);
}

export function normalizeLegacyLatex(formula) {
  return formula
    .replace(/&(?:amp;)?nbsp;?/gi,"~")
    .replace(/\\mbox\b/g,"\\text")
    .replace(/\\text\{%\}/g,"\\%").replace(/\\text%/g,"\\%")
    .replace(/_\\(min|max)\b/g,"_{\\mathrm{$1}}")
    .replace(/_\\rm\{([^{}]+)\}/g,"_{\\mathrm{$1}}")
    .replace(/_\{([^{}]*?)\\(min|max)\b([^{}]*)\}/g,"_{$1\\mathrm{$2}$3}")
    .replace(/\\tag\{#\}/g,"\\tag{\\#}")
    .replace(/\\begin\{array\}\s*\\\s+(?=[A-Za-z\\])/g,"\\begin{array}{c} ");
}

export function normalizeMathMarkup(html) {
  const joinDisplayFormula = (_match,formula,left,right) => `${left}${formula.replace(/<br\s*\/?\s*>/gi,"\n")}${right}`;
  return html
    .replace(/\$\$([\s\S]*?)\$\$/g,(match,formula) => joinDisplayFormula(match,formula,"$$","$$"))
    .replace(/\\\[([\s\S]*?)\\\]/g,(match,formula) => joinDisplayFormula(match,formula,"\\[","\\]"));
}
