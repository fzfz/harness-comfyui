export interface ManagedCliModuleOptions {
  readonly entry: string
  readonly output: string
}

export declare function managedCliModulePath(outputRoot: string): string
export declare function materializeManagedCliModule(options: ManagedCliModuleOptions): Promise<string>
export declare function materializeManagedCliModuleFromSources(repositoryRoot: string, outputRoot: string): Promise<string>
