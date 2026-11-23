/** Only the first 200 characters of a query are used (edge case: pasted paragraphs). */
export const MAX_QUERY_CHARS = 200;

/** Common English filler words dropped from queries and the index (AC-32). Type words like "skill" stay. */
export const STOPWORDS: ReadonlySet<string> = new Set([
  'i', 'me', 'my', 'we', 'our', 'you', 'need', 'needs', 'want', 'wants', 'looking', 'look', 'find',
  'a', 'an', 'the', 'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with', 'and', 'or', 'that', 'which',
  'some', 'something', 'anything', 'please', 'can', 'could', 'would', 'should', 'is', 'are', 'be',
  'it', 'its', 'this', 'these', 'how', 'do', 'does', 'what', 'from', 'into', 'about', 'any',
]);

/** Lowercases and splits text into words; anything that is not a letter or digit is a separator. */
export function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Light English stemmer: -ing, -ed, -es (after s, x, z, ch, sh), -s. The stem keeps at least 3 letters. */
export function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && /(?:s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) {
    return word.slice(0, -1);
  }
  return word;
}

/** Turns a raw query into the words to search for: capped, lowercased, no punctuation or filler, stemmed, unique. */
export function prepareQuery(raw: string): string[] {
  const words: string[] = [];
  for (const word of normalize(raw.slice(0, MAX_QUERY_CHARS))) {
    if (STOPWORDS.has(word)) continue;
    const stemmed = stem(word);
    if (!words.includes(stemmed)) words.push(stemmed);
  }
  return words;
}

/** Variants with two adjacent letters swapped, so a swap counts as one edit (AC-13). Words of 5+ letters only. */
export function transpositions(word: string): string[] {
  if (word.length < 5) return [];
  const out: string[] = [];
  for (let i = 0; i < word.length - 1; i += 1) {
    const swapped = word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
    if (swapped !== word && !out.includes(swapped)) out.push(swapped);
  }
  return out;
}
