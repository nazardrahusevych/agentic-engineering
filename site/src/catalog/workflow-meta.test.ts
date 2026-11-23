import { describe, expect, it } from 'vitest';
import { parseWorkflowMeta } from './workflow-meta.ts';

describe('parseWorkflowMeta (SPEC-3 AC-5, AC-6)', () => {
  it('reads literal name, description and phases', () => {
    const source = `// comment
export const meta = {
  name: 'audit-routes', // trailing comment
  "description": 'Audit every route ' +
    "for missing auth",
  phases: ['Find', \`Audit\`],
  extra: { nested: [1, true, null] },
}
await agent('…')`;
    expect(parseWorkflowMeta(source)).toEqual({
      name: 'audit-routes',
      description: 'Audit every route for missing auth',
      phases: ['Find', 'Audit'],
    });
  });

  it('defaults phases to an empty list and handles escapes', () => {
    expect(parseWorkflowMeta(`export const meta = { name: 'a', description: 'it\\'s "fine"' }`)).toEqual({
      name: 'a',
      description: `it's "fine"`,
      phases: [],
    });
  });

  it('rejects a missing meta', () => {
    expect(() => parseWorkflowMeta('const meta = { name: "a" }')).toThrow(/missing `export const meta/);
  });

  it('rejects values that are not literal', () => {
    expect(() => parseWorkflowMeta('export const meta = { name: NAME, description: "d" }')).toThrow(/only literal/);
    expect(() => parseWorkflowMeta('export const meta = { name: `a${b}`, description: "d" }')).toThrow(/template/);
    expect(() => parseWorkflowMeta('export const meta = buildMeta()')).toThrow(/object literal/);
    expect(() => parseWorkflowMeta('export const meta = { name: "a", description: "d" + x }')).toThrow(/concatenated/);
  });

  it('requires a name and a description', () => {
    expect(() => parseWorkflowMeta('export const meta = { description: "d" }')).toThrow(/meta.name/);
    expect(() => parseWorkflowMeta('export const meta = { name: "a", description: " " }')).toThrow(/meta.description/);
    expect(() => parseWorkflowMeta('export const meta = { name: "a", description: "d", phases: [1] }')).toThrow(/phases/);
  });
});
