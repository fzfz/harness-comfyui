export declare function hostModulePath(outputRoot: string): string
export declare function hostWorkerModulePath(outputRoot: string): string
export declare function materializeHostModule(
  repositoryRoot: string,
  options?: { readonly outputRoot?: string },
): Promise<string>
