export interface CliModuleOptions {
  readonly entry: string
  readonly output: string
}

export declare function sourceCliModulePath(repositoryRoot: string): string
export declare function materializeCliModule(options: CliModuleOptions): Promise<string>
export declare function materializeSourceCliModule(repositoryRoot: string): Promise<string>
