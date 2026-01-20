// Hashcards format parser
// Supports Q:/A: question-answer cards and C: cloze deletion cards
// See: https://github.com/eudoxia0/hashcards

export interface ParsedCard {
  front: string;
  back: string;
}

export interface ParseResult {
  cards: ParsedCard[];
  errors: string[];
}

export function parseHashcards(input: string): ParseResult {
  const cards: ParsedCard[] = [];
  const errors: string[] = [];

  // Normalize line endings and split into blocks by blank lines or ---
  const blocks = input
    .replace(/\r\n/g, '\n')
    .split(/\n(?:\s*\n|---\s*\n)/)
    .map(b => b.trim())
    .filter(b => b.length > 0);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockNum = i + 1;

    // Check for Q:/A: format
    if (block.match(/^Q:/im)) {
      const card = parseQACard(block);
      if (card) {
        cards.push(card);
      } else {
        errors.push(`Block ${blockNum}: Q: card missing A: answer`);
      }
      continue;
    }

    // Check for C: cloze format
    if (block.match(/^C:/im)) {
      const card = parseClozeCard(block);
      if (card) {
        cards.push(card);
      } else {
        errors.push(`Block ${blockNum}: C: card has no [deletions]`);
      }
      continue;
    }

    // Unknown format - skip with warning
    if (block.length > 0) {
      errors.push(`Block ${blockNum}: Unknown format (expected Q: or C:)`);
    }
  }

  return { cards, errors };
}

function parseQACard(block: string): ParsedCard | null {
  // Match Q: and A: sections, handling multi-line content
  const qaMatch = block.match(/^Q:\s*([\s\S]*?)\s*(?:^A:\s*([\s\S]*))?$/im);

  if (!qaMatch) return null;

  const front = qaMatch[1]?.trim();
  const back = qaMatch[2]?.trim();

  if (!front || !back) return null;

  return { front, back };
}

function parseClozeCard(block: string): ParsedCard | null {
  // Extract content after C:
  const clozeMatch = block.match(/^C:\s*([\s\S]*)$/im);
  if (!clozeMatch) return null;

  const content = clozeMatch[1].trim();

  // Find all [bracketed] deletions
  const deletions = content.match(/\[([^\]]+)\]/g);
  if (!deletions || deletions.length === 0) return null;

  // Front: content with deletions replaced by [...]
  const front = content.replace(/\[([^\]]+)\]/g, '[...]');

  // Back: content with deletions shown (brackets removed)
  const back = content.replace(/\[([^\]]+)\]/g, '$1');

  return { front, back };
}
