export interface DryRunCommandInput {
  root: string
  args: string[]
}

export interface DryRunOptions {
  runCommand?: (input: DryRunCommandInput) => number
}

export declare function runReleaseDryRun(root?: string, options?: DryRunOptions): { steps: string[][] }
