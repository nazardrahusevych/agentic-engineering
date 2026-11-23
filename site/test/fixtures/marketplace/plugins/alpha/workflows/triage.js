// Fixture workflow: read as text by the catalog build, never executed.
export const meta = {
  name: 'triage',
  description: 'Triage new issues: label them ' + 'and suggest an owner.',
  phases: ['Collect', 'Label', "Report"],
}

throw new Error('the catalog build must never execute a workflow file')
