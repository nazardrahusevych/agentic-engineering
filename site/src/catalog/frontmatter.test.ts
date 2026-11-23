import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from './frontmatter.ts';
import { ProblemError } from './problems.ts';

describe('parseFrontmatter', () => {
  it('reads the YAML block and the body', () => {
    const result = parseFrontmatter('---\nname: x\ndescription: Does x.\n---\n\n# Body\n', 'a/SKILL.md');
    expect(result.data).toEqual({ name: 'x', description: 'Does x.' });
    expect(result.body).toBe('\n# Body\n');
  });

  it('handles CRLF line endings', () => {
    const result = parseFrontmatter('---\r\nname: x\r\ndescription: y\r\n---\r\nBody\r\n', 'a.md');
    expect(result.data).toEqual({ name: 'x', description: 'y' });
    expect(result.body).toBe('Body\r\n');
  });

  it('returns empty data when there is no frontmatter', () => {
    expect(parseFrontmatter('Just text\n', 'a.md')).toEqual({ data: {}, body: 'Just text\n' });
    expect(parseFrontmatter('---\n---\nBody', 'a.md')).toEqual({ data: {}, body: 'Body' });
  });

  it('AC-6: broken YAML fails with the path and the line', () => {
    const text = '---\nname: x\ndescription: [unclosed\n---\nBody\n';
    try {
      parseFrontmatter(text, 'plugins/a/skills/x/SKILL.md');
      expect.unreachable('should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ProblemError);
      const { problem } = error as ProblemError;
      expect(problem.path).toBe('plugins/a/skills/x/SKILL.md');
      expect(problem.reason).toMatch(/^invalid frontmatter: .+ \(line \d+\)$/);
    }
  });

  it('AC-6: reports the line of the error inside the file', () => {
    const text = '---\nname: x\nbad: : :\n  - nope\n---\n';
    expect(() => parseFrontmatter(text, 'a.md')).toThrow(/\(line [3-5]\)/);
  });

  it('AC-6: a non-mapping block is a problem', () => {
    expect(() => parseFrontmatter('---\n- a\n- b\n---\n', 'a.md')).toThrow(/expected a mapping/);
  });
});
