export function isStatementPartHeading(text) {
  return /^Parte\s+[A-Z0-9]+(?:[.:]|\s|$)/.test(String(text).trim());
}
