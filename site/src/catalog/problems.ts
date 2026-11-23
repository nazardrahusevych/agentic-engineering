/** One reason the catalog cannot be built, tied to the repository file that caused it (AC-6). */
export interface CatalogProblem {
  path: string;
  reason: string;
}

/** Thrown after every problem of a build has been collected, so one run reports all of them. */
export class CatalogBuildError extends Error {
  readonly problems: CatalogProblem[];

  constructor(problems: CatalogProblem[]) {
    super(
      `The catalog build failed:\n${problems.map((problem) => `${problem.path}: ${problem.reason}`).join('\n')}`,
    );
    this.name = 'CatalogBuildError';
    this.problems = problems;
  }
}

/** A single problem raised while reading one file; collected by the caller into a CatalogBuildError. */
export class ProblemError extends Error {
  readonly problem: CatalogProblem;

  constructor(path: string, reason: string) {
    super(`${path}: ${reason}`);
    this.name = 'ProblemError';
    this.problem = { path, reason };
  }
}
