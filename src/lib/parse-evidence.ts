// INTENT: Разбор description поручения на основной текст + evidence-цитаты.
// Формат импортёра v5: секция после строки "Основа (дословные цитаты):",
// цитаты = строки, начинающиеся с "> «...» — Спикер".
// Ответственность: чистая функция, без React/IO; старые поручения без цитат → quotes=[].
export interface EvidenceQuote { text: string; speaker: string }
export interface ParsedDescription { main: string; quotes: EvidenceQuote[] }

export function splitEvidence(description: string | null | undefined): ParsedDescription {
  if (!description) return { main: "", quotes: [] };
  const lines = description.split("\n");
  const quotes: EvidenceQuote[] = [];
  const mainLines: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("> «") || t.startsWith("> \"") || t.startsWith('> "')) {
      const m = t.match(/^>\s*[«"](.+?)[»"]\s*[—–-]\s*(.+)$/);
      if (m) quotes.push({ text: m[1], speaker: m[2].trim() });
      else quotes.push({ text: t.replace(/^>\s*/, ""), speaker: "" });
    } else if (t === "Основа (дословные цитаты):") {
      // разделитель секции — не рендерим
    } else {
      mainLines.push(line);
    }
  }
  return { main: mainLines.join("\n").trim(), quotes };
}
