export function presentationArguments(argv: readonly string[], valueOptions?: readonly string[]): { args: string[]; quiet: boolean; helpRequested: boolean }
export function renderHelp(definition: unknown, argv: readonly string[], values?: Readonly<Record<string, string | number>>, renderContract?: (key: string) => readonly string[]): string | undefined
export function helpHint(definition: unknown, argv: readonly string[]): string
export function renderNextSteps(definition: unknown, key: string, quiet?: boolean, values?: Record<string, string>): string
export function shellQuote(value: unknown): string
