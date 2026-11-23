import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// Structural checks of the site workflow, the Validate workflow and the request form; live behaviour is checked by
// hand (docs/catalog-site.md).
const read = (path: string) => parse(readFileSync(resolve('..', path), 'utf8'));
const workflow = read('.github/workflows/pages.yml');
const validate = read('.github/workflows/validate.yml');
const form = read('.github/ISSUE_TEMPLATE/artifact-request.yml');

interface Step {
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, string>;
}
type Job = { name: string; steps: Step[]; permissions: Record<string, string> };
const unit = workflow.jobs['site-unit'] as Job;
const build = workflow.jobs['site-build'] as Job;
const e2e = workflow.jobs['site-e2e'] as Job;
const deploy = workflow.jobs.deploy as { needs: string | string[]; if: string; steps: Step[]; permissions: Record<string, string> };
const uses = (job: { steps: Step[] }, action: string) => job.steps.find((step) => step.uses?.startsWith(`${action}@`));

describe('Pages workflow', () => {
  it('AC-1: a push to main builds and deploys with actions/deploy-pages', () => {
    expect(workflow.on.push.branches).toEqual(['main']);
    expect(uses(deploy, 'actions/deploy-pages')).toBeDefined();
    expect(uses(build, 'actions/upload-pages-artifact')?.with?.path).toBe('site/dist');
    expect(build.steps.some((step) => step.run === 'npm run build')).toBe(true);
  });

  it('AC-2: pull requests run the build as a check and never deploy', () => {
    expect(workflow.on).toHaveProperty('pull_request');
    expect(deploy.if).toBe("github.event_name != 'pull_request'");
    expect(uses(build, 'actions/upload-pages-artifact')?.if).toBe("github.event_name != 'pull_request'");
  });

  it('AC-7: deploy needs every site job to succeed', () => {
    expect([deploy.needs].flat()).toEqual(['site-unit', 'site-build', 'site-e2e']);
  });

  it('SPEC-3 AC-9: unit tests, build and e2e are separate, named jobs', () => {
    expect(unit.steps.map((step) => step.run).filter(Boolean)).toEqual(['npm ci', 'npm run typecheck', 'npm test']);
    expect(build.steps.map((step) => step.run).filter(Boolean)).toEqual(['npm ci', 'npm run build']);
    expect(e2e.steps.map((step) => step.run).filter(Boolean)).toEqual([
      'npm ci',
      'npx playwright install --with-deps chromium',
      'npm run test:e2e',
    ]);
    expect([unit.name, build.name, e2e.name]).toEqual([
      'Site / typecheck and unit tests',
      'Site / build',
      'Site / end-to-end tests',
    ]);
  });

  it('SPEC-3 AC-10 / SPEC-2 AC-15: plugin validation runs in its own workflow', () => {
    expect(workflow.name).toBe('Site');
    expect(validate.name).toBe('Validate');
    const steps = (validate.jobs.plugins as Job).steps.map((step) => step.run).filter(Boolean);
    expect(steps).toEqual(['npm run validate', 'npm test']);
    expect(validate.on).toHaveProperty('pull_request');
    expect(validate.permissions).toEqual({ contents: 'read' });
  });

  it('AC-8: a manual run builds the ref it is given', () => {
    const input = workflow.on.workflow_dispatch.inputs.ref;
    expect(input).toMatchObject({ required: true, default: 'main', type: 'string' });
    for (const job of [unit, build, e2e]) {
      expect(uses(job, 'actions/checkout')?.with?.ref).toBe(
        "${{ github.event_name == 'workflow_dispatch' && inputs.ref || '' }}",
      );
    }
  });

  it('uses least-privilege permissions', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    for (const job of [unit, build, e2e]) expect(job.permissions).toEqual({ contents: 'read' });
    expect(deploy.permissions).toEqual({ pages: 'write', 'id-token': 'write' });
  });

  it('pins every action to a full commit SHA', () => {
    for (const [file, parsed] of [
      ['pages.yml', workflow],
      ['validate.yml', validate],
    ] as const) {
      const all = Object.values(parsed.jobs as Record<string, { steps: Step[] }>).flatMap((job) => job.steps);
      const actions = all.filter((step) => step.uses);
      expect(actions.length).toBeGreaterThanOrEqual(2);
      for (const step of actions) expect(step.uses).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      const text = readFileSync(resolve(`../.github/workflows/${file}`), 'utf8');
      for (const line of text.split('\n').filter((l) => l.includes('uses:'))) expect(line).toMatch(/# v\d+\.\d+\.\d+$/);
    }
  });
});

describe('request issue form (AC-17)', () => {
  it('labels the issue "request" and has the fields the site pre-fills', () => {
    expect(form.labels).toEqual(['request']);
    const ids = (form.body as { id?: string }[]).map((field) => field.id).filter(Boolean);
    expect(ids).toEqual(['query', 'filters', 'details']);
  });
});
