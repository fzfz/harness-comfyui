export interface ClientModuleOptions {
  readonly entry: string
  readonly css: string
  readonly output: string
}

export declare const CLIENT_MODULE_POLICY: Readonly<{
  externals: readonly string[]
  inlineRules: readonly RegExp[]
}>

export declare function materializeClientModule(options: ClientModuleOptions): Promise<void>
export declare function sourceClientModulePath(repositoryRoot: string): string
export declare function materializeSourceClientModule(repositoryRoot: string): Promise<string>
