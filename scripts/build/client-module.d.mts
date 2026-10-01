export interface ClientModuleOptions {
  readonly entry: string
  readonly css: string
  readonly output: string
}

export declare const CLIENT_MODULE_POLICY: Readonly<{
  externals: readonly string[]
  inlineRules: readonly RegExp[]
}>
export declare function clientModulePath(outputRoot: string): string
export declare function materializeClientModule(options: ClientModuleOptions): Promise<string>
export declare function materializeClientModuleFromSources(repositoryRoot: string, outputRoot: string): Promise<string>
