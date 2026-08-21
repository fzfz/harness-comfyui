import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const registryPath = 'src/host/tools/register-project-tools.ts'
const pluginPath = 'src/host/plugin.ts'

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag !== '--root') throw new Error(`unknown argument ${flag}`)
    if (values.has(flag)) throw new Error('duplicate argument --root')
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--') || value.length === 0) {
      throw new Error('--root requires a non-empty value')
    }
    values.set(flag, value)
    index += 1
  }
  return resolve(values.get('--root') ?? repositoryRoot)
}

function collectSourceFiles(directory, result = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) collectSourceFiles(path, result)
    else if (entry.isFile() && /\.[cm]?tsx?$/u.test(entry.name)) result.push(path)
  }
  return result
}

function isDirectRegisterCall(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false
  const register = node.expression
  if (register.name.text !== 'register' || !ts.isPropertyAccessExpression(register.expression)) return false
  const tools = register.expression
  return tools.name.text === 'tools' && ts.isIdentifier(tools.expression) && tools.expression.text === 'ctx'
}

function isRegistryCall(node) {
  return ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === 'registerProjectTools'
}

function scan(root) {
  const sourceRoot = resolve(root, 'src')
  const sourceFiles = collectSourceFiles(sourceRoot)
  const directRegistrations = []
  const registryCalls = []

  for (const filePath of sourceFiles) {
    const source = readFileSync(filePath, 'utf8')
    const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind)
    const relativePath = relative(root, filePath).replaceAll('\\', '/')
    function visit(node) {
      if (isDirectRegisterCall(node)) directRegistrations.push({ relativePath, node })
      if (isRegistryCall(node)) registryCalls.push({ relativePath, node })
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }

  for (const entry of directRegistrations) {
    if (entry.relativePath !== registryPath) {
      throw new Error(`ctx.tools.register() is only allowed in ${registryPath}; found ${entry.relativePath}`)
    }
  }
  if (directRegistrations.length !== 1) {
    throw new Error(`expected exactly one ctx.tools.register() call in ${registryPath}; found ${directRegistrations.length}`)
  }

  for (const entry of registryCalls) {
    if (entry.relativePath !== pluginPath) {
      throw new Error(`registerProjectTools() is only allowed in ${pluginPath}; found ${entry.relativePath}`)
    }
  }
  if (registryCalls.length !== 1) {
    throw new Error(`expected exactly one registerProjectTools() call in ${pluginPath}; found ${registryCalls.length}`)
  }
}

export function main(argv = process.argv.slice(2)) {
  const root = parseArguments(argv)
  scan(root)
  process.stdout.write(`Harness project Tool registry boundary is valid: ${root}\n`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stderr.write(`check:harness-boundary: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
