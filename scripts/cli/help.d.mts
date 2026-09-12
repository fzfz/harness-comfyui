export function presentationArguments(argv: readonly string[], valueOptions?: readonly string[]): { args: string[]; quiet: boolean; helpRequested: boolean }
export function renderHelp(definition: unknown, argv: readonly string[]): string | undefined
export function helpHint(definition: unknown, argv: readonly string[]): string
export function nextSteps(definition: unknown, key: string, quiet?: boolean, values?: Record<string, string>): void
export function shellQuote(value: unknown): string
