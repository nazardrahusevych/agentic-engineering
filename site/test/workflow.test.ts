import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// Structural checks of the Pages workflow and the request form; live behaviour is checked by hand (docs/catalog-site.md).
const read = (path: string) => parse(readFileSync(resolve('..', path), 'utf8'));
const workflow = read('.github/workflows/pages.yml');
const form = read('.github/ISSUE_TEMPLATE/artifact-request.yml');

interface Step {
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, string>;
}
const build = workflow.jobs.build as { steps: Step[]; permissions: Record<string, string> };
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

  it('AC-7: deploy needs a successful build', () => {
    expect([deploy.needs].flat()).toContain('build');
  });

  it('AC-8: a manual run builds the ref it is given', () => {
    const input = workflow.on.workflow_dispatch.inputs.ref;
    expect(input).toMatchObject({ required: true, default: 'main', type: 'string' });
    expect(uses(build, 'actions/checkout')?.with?.ref).toBe(
      "${{ github.event_name == 'workflow_dispatch' && inputs.ref || '' }}",
    );
  });

  it('uses least-privilege permissions', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(build.permissions).toEqual({ contents: 'read' });
    expect(deploy.permissions).toEqual({ pages: 'write', 'id-token': 'write' });
  });

  it('pins every action to a full commit SHA', () => {
    const all = Object.values(workflow.jobs as Record<string, { steps: Step[] }>).flatMap((job) => job.steps);
    const actions = all.filter((step) => step.uses);
    expect(actions.length).toBeGreaterThanOrEqual(4);
    for (const step of actions) expect(step.uses).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    const text = readFileSync(resolve('../.github/workflows/pages.yml'), 'utf8');
    for (const line of text.split('\n').filter((l) => l.includes('uses:'))) expect(line).toMatch(/# v\d+\.\d+\.\d+$/);
  });
});

describe('request issue form (AC-17)', () => {
  it('labels the issue "request" and has the fields the site pre-fills', () => {
    expect(form.labels).toEqual(['request']);
    const ids = (form.body as { id?: string }[]).map((field) => field.id).filter(Boolean);
    expect(ids).toEqual(['query', 'filters', 'details']);
  });
});
