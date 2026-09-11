export declare function sourceHostModulePath(repositoryRoot: string): string
export declare function sourceHostWorkerModulePath(repositoryRoot: string): string
export declare function materializeSourceHostModule(
  repositoryRoot: string,
  options?: { readonly outputRoot?: string; readonly web?: boolean },
): Promise<string>
