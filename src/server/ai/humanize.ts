/*
 * Phrases that make a Slovenian text read as written by AI (owner 2026-10-19, after the "humanizer" skill he sent:
 * its English word list adapted to how ChatGPT-style Slovenian sounds). Used two ways: the list goes into the prompts
 * of everything the CRM writes to prospects, and AI e-mails that still contain them are rejected and rewritten.
 */

export const AI_PHRASES: { re: RegExp; label: string }[] = [
  { re: /ključnega pomena|ključn[a-z]* vlog/i, label: "ključnega pomena" },
  { re: /\bne (le|samo)\b[^.]{0,80}\b(ampak|temveč) tudi\b/i, label: "ne samo … ampak tudi" },
  { re: /v današnjem (hitrem|digitalnem|sodobnem)/i, label: "v današnjem … svetu" },
  { re: /digitaln[a-z]* (doba|dobi|svet|prisotnost)/i, label: "digitalna doba/prisotnost" },
  { re: /\b(izjemn|neverjetn|fantastičn|odličn)[a-z]* (priložnost|rešitev)/i, label: "izjemna priložnost/rešitev" },
  { re: /\bedinstven/i, label: "edinstven" },
  { re: /\bceloviti?[a-z]*\b/i, label: "celovit" },
  { re: /\bbrezhibn/i, label: "brezhiben" },
  { re: /\bpopeljal|\bdvignil[a-z]* na (višjo|naslednjo) raven|naslednjo raven/i, label: "na naslednjo raven" },
  { re: /\bv srcu\b/i, label: "v srcu (mesta)" },
  { re: /\bpotopimo se|poglobimo se\b/i, label: "poglobimo se" },
  { re: /\bomogoča(jo)? vam,? da\b/i, label: "omogoča vam, da" },
  { re: /\bpoleg tega\b|\bnadalje\b|\bpovrhu\b/i, label: "poleg tega / nadalje" },
  { re: /\bpomembno je (poudariti|omeniti)|velja omeniti|naj poudarim/i, label: "pomembno je poudariti" },
  { re: /\bskratka\b|\bv zaključku\b|\bza konec\b/i, label: "skratka / v zaključku" },
  { re: /\bresnica je\b|\bdejstvo je\b|\bbistvo je\b/i, label: "resnica/dejstvo je" },
  { re: /\bzamislite si\b|\bpredstavljajte si\b/i, label: "predstavljajte si" },
  { re: /\bprelomn|\brevolucionarn|\binovativn/i, label: "prelomno/inovativno" },
  { re: /\bpodjetje vaše velikosti\b|\bkot je vaše\b/i, label: "podjetje kot je vaše" },
  { re: /\bupam, da (vas|vam) ta (e-?mail|sporočilo) najde\b/i, label: "upam, da vas sporočilo najde" },
  { re: /\bne oklevajte\b/i, label: "ne oklevajte" },
  { re: /!\s*\n|!!/, label: "klicaji" },
];

/** Labels of AI phrases found in the text (empty = fine). */
export function aiPhrases(text: string): string[] {
  return [...new Set(AI_PHRASES.filter((p) => p.re.test(text)).map((p) => p.label))];
}

/** One line for prompts: what not to write. */
export const AVOID_PHRASES_RULE = `Piši kot človek, ne kot AI: brez fraz ${AI_PHRASES.map((p) => `»${p.label}«`).join(", ")}. Kratki, preprosti stavki, konkretne besede namesto pridevnikov, brez klicajev.`;
