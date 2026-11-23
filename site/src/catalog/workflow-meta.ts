/**
 * Reads `export const meta = { name, description, phases }` from a workflow file's text. The file is never executed or
 * imported (SPEC-3 AC-6): this is a small parser that accepts only literal values — strings without `${}`
 * substitutions, arrays of strings, numbers, booleans and nested literal objects.
 */

export interface WorkflowMeta {
  name: string;
  description: string;
  phases: string[];
}

export class WorkflowMetaError extends Error {}

type Literal = string | number | boolean | null | Literal[] | { [key: string]: Literal };

class Parser {
  pos = 0;
  constructor(private readonly text: string) {}

  fail(message: string): never {
    throw new WorkflowMetaError(message);
  }

  skip(): void {
    for (;;) {
      const rest = this.text.slice(this.pos);
      const space = /^\s+/.exec(rest);
      if (space) {
        this.pos += space[0].length;
        continue;
      }
      if (rest.startsWith('//')) {
        const end = this.text.indexOf('\n', this.pos);
        this.pos = end === -1 ? this.text.length : end + 1;
        continue;
      }
      if (rest.startsWith('/*')) {
        const end = this.text.indexOf('*/', this.pos + 2);
        if (end === -1) this.fail('unterminated comment');
        this.pos = end + 2;
        continue;
      }
      return;
    }
  }

  peek(): string {
    this.skip();
    return this.text[this.pos] ?? '';
  }

  expect(char: string): void {
    if (this.peek() !== char) this.fail(`expected "${char}"`);
    this.pos += 1;
  }

  string(): string {
    const quote = this.text[this.pos];
    let out = '';
    this.pos += 1;
    while (this.pos < this.text.length) {
      const char = this.text[this.pos]!;
      if (char === quote) {
        this.pos += 1;
        return out;
      }
      if (quote === '`' && char === '$' && this.text[this.pos + 1] === '{') this.fail('template substitutions are not literal');
      if (quote !== '`' && char === '\n') this.fail('unterminated string');
      if (char === '\\') {
        const next = this.text[this.pos + 1] ?? '';
        const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '`': '`', '\n': '' };
        if (!(next in escapes)) this.fail(`unsupported escape "\\${next}"`);
        out += escapes[next];
        this.pos += 2;
        continue;
      }
      out += char;
      this.pos += 1;
    }
    return this.fail('unterminated string');
  }

  key(): string {
    const char = this.peek();
    if (char === '"' || char === "'") return this.string();
    const match = /^[A-Za-z_$][\w$]*/.exec(this.text.slice(this.pos));
    if (!match) this.fail('expected a property name');
    this.pos += match[0].length;
    return match[0];
  }

  value(): Literal {
    const char = this.peek();
    if (char === '"' || char === "'" || char === '`') {
      const first = this.string();
      // Allow 'a' + 'b' concatenation of literals.
      let out = first;
      while (this.peek() === '+') {
        this.pos += 1;
        const next = this.peek();
        if (next !== '"' && next !== "'" && next !== '`') this.fail('only string literals can be concatenated');
        out += this.string();
      }
      return out;
    }
    if (char === '[') {
      this.pos += 1;
      const items: Literal[] = [];
      while (this.peek() !== ']') {
        items.push(this.value());
        if (this.peek() === ',') this.pos += 1;
        else if (this.peek() !== ']') this.fail('expected "," or "]"');
      }
      this.pos += 1;
      return items;
    }
    if (char === '{') {
      this.pos += 1;
      const object: Record<string, Literal> = {};
      while (this.peek() !== '}') {
        const key = this.key();
        this.expect(':');
        object[key] = this.value();
        if (this.peek() === ',') this.pos += 1;
        else if (this.peek() !== '}') this.fail('expected "," or "}"');
      }
      this.pos += 1;
      return object;
    }
    const word = /^(?:true|false|null|-?\d+(?:\.\d+)?)/.exec(this.text.slice(this.pos));
    if (word) {
      this.pos += word[0].length;
      const token = word[0];
      if (token === 'true') return true;
      if (token === 'false') return false;
      if (token === 'null') return null;
      return Number(token);
    }
    return this.fail('meta must contain only literal values');
  }
}

/** Parses the literal `meta` export; throws WorkflowMetaError with a reason when it is missing or not literal. */
export function parseWorkflowMeta(source: string): WorkflowMeta {
  const start = /export\s+const\s+meta\s*=\s*/.exec(source);
  if (!start) throw new WorkflowMetaError('missing `export const meta = { name, description }`');
  const parser = new Parser(source);
  parser.pos = start.index + start[0].length;
  if (parser.peek() !== '{') throw new WorkflowMetaError('meta must be an object literal');
  const meta = parser.value();
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
    throw new WorkflowMetaError('meta must be an object literal');
  }
  const { name, description, phases } = meta;
  if (typeof name !== 'string' || name.trim() === '') throw new WorkflowMetaError('meta.name must be a non-empty string');
  if (typeof description !== 'string' || description.trim() === '') {
    throw new WorkflowMetaError('meta.description must be a non-empty string');
  }
  if (phases !== undefined && (!Array.isArray(phases) || phases.some((phase) => typeof phase !== 'string'))) {
    throw new WorkflowMetaError('meta.phases must be an array of strings');
  }
  return { name: name.trim(), description: description.trim(), phases: (phases as string[] | undefined) ?? [] };
}
