import ts from 'typescript'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const moduleRoot = dirname(resolve(root, manifest.imports['#contracts']))
const isInside = path => path === moduleRoot || path.startsWith(`${moduleRoot}${sep}`)
const projectionFields = new Set(['oneOf', 'anyOf'])
const schemaFields = new Set(['dict', 'list', 'inner', 'meta'])
const fileReaders = new Set(['readFile', 'readFileSync', 'open', 'openSync', 'createReadStream'])
const configurationOwners = new Set([
  'src/config/load-profile.ts',
  'src/image-reader/plugin-schema.ts',
  'src/image-reader/settings.ts',
  'src/image-reader/diagnostics-schema.ts',
  'src/image-reader/credential-schema.ts',
  'src/browser-settings-schema.ts',
  'src/client/workbench/results-tab-schema.ts',
  'src/source-settings.ts',
  'src/plugin-storage-schema.ts',
  'src/host/core/schema.ts',
])
const pluginConfigurationOwners = new Set(['src/host/workbench/tools.ts', 'src/host/workbench/specialist-tools.ts'])

function unwrapExpression(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)
    || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node) || ts.isExpressionWithTypeArguments(node))) node = node.expression
  return node
}

export function contractConsumerFiles() {
  function walk(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const path = resolve(directory, entry.name)
      if (isInside(path)) return []
      return entry.isDirectory() ? walk(path) : /\.(ts|tsx|mjs)$/.test(path) ? [relative(root, path)] : []
    })
  }
  return ['src', 'scripts', 'tests'].flatMap(directory => walk(resolve(root, directory)))
}

const forwardingGraphs = new WeakMap()

function forwardingGraph(sources) {
  if (forwardingGraphs.has(sources)) return forwardingGraphs.get(sources)
  const modules = new Map([...sources].map(([file, source]) => [file, {
    tree: ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true),
    imports: new Map(), bindings: new Map(), exports: new Set(), positions: new Set(),
  }]))
  function target(file, specifier) {
    if (specifier === '#contracts') return '#contracts'
    const path = relative(root, resolve(root, dirname(file), specifier))
    if (isInside(resolve(root, path))) return '#contracts'
    for (const candidate of [path, path.replace(/\.js$/, '.ts'), `${path}.ts`, `${path}.tsx`, `${path}/index.ts`]) if (modules.has(candidate)) return candidate
    return undefined
  }
  function exported(file, specifier, name = '*') {
    const resolved = target(file, specifier)
    if (resolved === '#contracts') return true
    const exports = modules.get(resolved)?.exports
    return name === '*' ? !!exports?.size : exports?.has(name) || exports?.has('*')
  }
  for (const info of modules.values()) {
    for (const node of info.tree.statements) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier) && node.importClause) {
        const source = node.moduleSpecifier.text
        if (node.importClause.name) info.imports.set(node.importClause.name.text, { source, name: 'default' })
        const clause = node.importClause.namedBindings
        if (clause && ts.isNamespaceImport(clause)) info.imports.set(clause.name.text, { source, name: '*' })
        if (clause && ts.isNamedImports(clause)) for (const binding of clause.elements) info.imports.set(binding.name.text, { source, name: (binding.propertyName ?? binding.name).text })
      }
      if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) info.bindings.set(declaration.name.text, declaration.initializer)
        if (ts.isObjectBindingPattern(declaration.name)) for (const binding of declaration.name.elements) if (ts.isIdentifier(binding.name)) info.bindings.set(binding.name.text, declaration.initializer)
      }
      if (ts.isTypeAliasDeclaration(node)) info.bindings.set(node.name.text, node.type)
    }
  }
  function origin(file, node, seen = new Set()) {
    node = unwrapExpression(node)
    if (!node) return false
    const info = modules.get(file)
    if (ts.isIdentifier(node)) {
      const imported = info.imports.get(node.text)
      if (imported) return exported(file, imported.source, imported.name)
      if (seen.has(node.text)) return false
      return origin(file, info.bindings.get(node.text), new Set([...seen, node.text]))
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isAwaitExpression(node)) return origin(file, node.expression, seen)
    if (ts.isQualifiedName(node)) return origin(file, node.left, seen)
    if (ts.isTypeReferenceNode(node)) return !node.typeArguments?.length && origin(file, node.typeName, seen)
    if (ts.isTypeQueryNode(node)) return origin(file, node.exprName, seen)
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) return !node.typeArguments?.length && exported(file, node.argument.literal.text, node.qualifier && ts.isIdentifier(node.qualifier) ? node.qualifier.text : '*')
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) return exported(file, node.arguments[0].text)
    if (ts.isObjectLiteralExpression(node)) return node.properties.some(property => ts.isShorthandPropertyAssignment(property) ? origin(file, property.name, seen) : ts.isPropertyAssignment(property) && origin(file, property.initializer, seen))
    return false
  }
  let changed
  do {
    changed = false
    for (const [file, info] of modules) {
      function forward(node, name) {
        info.positions.add(node.getStart(info.tree))
        if (!info.exports.has(name)) { info.exports.add(name); changed = true }
      }
      for (const node of info.tree.statements) {
        if (ts.isExportDeclaration(node)) {
          if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
            const source = node.moduleSpecifier.text
            if (node.exportClause && ts.isNamedExports(node.exportClause)) {
              for (const binding of node.exportClause.elements) if (exported(file, source, (binding.propertyName ?? binding.name).text)) forward(node, binding.name.text)
            } else if (exported(file, source)) forward(node, '*')
          } else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            for (const binding of node.exportClause.elements) if (origin(file, binding.propertyName ?? binding.name)) forward(node, binding.name.text)
          }
        }
        if (ts.isExportAssignment(node) && origin(file, node.expression)) forward(node, 'default')
        if (node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
          if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
            if (origin(file, declaration.initializer)) {
              if (ts.isIdentifier(declaration.name)) forward(node, declaration.name.text)
              if (ts.isObjectBindingPattern(declaration.name)) for (const binding of declaration.name.elements) if (ts.isIdentifier(binding.name)) forward(node, binding.name.text)
            }
          }
          if (ts.isTypeAliasDeclaration(node) && origin(file, node.type)) forward(node, node.name.text)
        }
      }
    }
  } while (changed)
  let checker
  function typeChecker() {
    if (!checker) {
      const options = { allowJs: true, noLib: true, noResolve: true, types: [] }
      const host = ts.createCompilerHost(options)
      const source = file => modules.get(relative(root, resolve(root, file)))?.tree
      host.getSourceFile = source
      host.getCurrentDirectory = () => root
      host.fileExists = file => !!source(file)
      host.readFile = file => source(file)?.text
      checker = ts.createProgram([...modules.keys()], options, host).getTypeChecker()
    }
    return checker
  }
  function implementation(symbol) {
    if (symbol?.valueDeclaration && ts.isShorthandPropertyAssignment(symbol.valueDeclaration)) symbol = typeChecker().getShorthandAssignmentValueSymbol(symbol.valueDeclaration)
    return symbol?.declarations?.find(declaration => ts.isFunctionLike(declaration) && declaration.body)
      ?? symbol?.valueDeclaration
      ?? symbol?.declarations?.find(declaration => ts.isImportSpecifier(declaration) || ts.isNamespaceImport(declaration) || ts.isImportClause(declaration))
  }
  function declaration(node) {
    return implementation(typeChecker().getSymbolAtLocation(node))
  }
  function propertyDeclaration(node, key, instance) {
    const checker = typeChecker()
    let type
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const symbol = node.name ? checker.getSymbolAtLocation(node.name) : checker.getTypeAtLocation(node).symbol
      if (symbol) type = instance ? checker.getDeclaredTypeOfSymbol(symbol) : checker.getTypeOfSymbolAtLocation(symbol, node)
    } else type = checker.getTypeAtLocation(node)
    return implementation(type?.getProperty(key))
  }
  const graph = { modules, exported, declaration, propertyDeclaration }
  forwardingGraphs.set(sources, graph)
  return graph
}

export function inspectContractConsumers(sources = new Map(contractConsumerFiles().map(file => [file, readFileSync(resolve(root, file), 'utf8')]))) {
  return [...sources].flatMap(([file, source]) => inspectContractConsumer(file, source, sources))
}

export function inspectContractConsumer(file, source, sources = new Map([[file, source]])) {
  const graph = forwardingGraph(sources)
  const tree = graph.modules.get(file).tree
  const problems = []
  const bindings = new Map()
  const aliases = new Map()
  const memberBindings = new Map()
  const externalProtocol = file.startsWith('src/host/source-client/')
  const localRules = !file.startsWith('tests/') && !externalProtocol
  const configuration = configurationOwners.has(file)

  function staticPropertyName(node, seen = new Set()) {
    if (!node) return undefined
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text
    if (ts.isComputedPropertyName(node)) return literal(node.expression, seen)
    return undefined
  }
  function property(node, seen = new Set()) {
    if (ts.isPropertyAccessExpression(node)) return staticPropertyName(node.name, seen)
    if (ts.isElementAccessExpression(node)) return literal(node.argumentExpression, seen)
    return undefined
  }
  function callName(node, seen = new Set()) {
    node = unwrapExpression(node)
    if (!node) return undefined
    if (node.kind === ts.SyntaxKind.ImportKeyword) return 'import'
    if (ts.isIdentifier(node)) {
      const declaration = graph.declaration(node)
      if (!declaration || seen.has(declaration)) return node.text
      const next = new Set([...seen, declaration])
      const member = memberBindings.get(declaration)?.path.at(-1), binding = bindings.get(declaration)
      const alias = member ? staticPropertyName(member.name, next) : aliases.get(declaration)
      return alias ?? (binding ? callName(binding, next) : node.text)
    }
    return property(node, seen)
  }
  function literal(node, seen = new Set()) {
    node = unwrapExpression(node)
    if (!node) return undefined
    if (ts.isStringLiteralLike(node)) return node.text
    if (ts.isIdentifier(node)) {
      const declaration = graph.declaration(node)
      if (bindings.has(declaration) && !seen.has(declaration)) return literal(bindings.get(declaration), new Set([...seen, declaration]))
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = literal(node.left, seen), right = literal(node.right, seen)
      return left === undefined || right === undefined ? undefined : left + right
    }
    if (ts.isTemplateExpression(node)) {
      let result = node.head.text
      for (const span of node.templateSpans) {
        const value = literal(span.expression, seen)
        if (value === undefined) return undefined
        result += value + span.literal.text
      }
      return result
    }
    if (node.getText(tree) === 'import.meta.url') return pathToFileURL(resolve(root, file)).href
    if (node.getText(tree) === 'import.meta.dirname') return dirname(resolve(root, file))
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL') {
      const target = literal(node.arguments?.[0], seen), base = literal(node.arguments?.[1], seen)
      if (target !== undefined && base !== undefined) return new URL(target, base).href
    }
    if (ts.isCallExpression(node)) {
      const name = callName(node.expression, seen), parts = node.arguments.map(argument => literal(argument, seen))
      if (parts.every(part => part !== undefined)) {
        if (name === 'join') return join(...parts)
        if (name === 'resolve') return resolve(...parts)
        if (name === 'fileURLToPath' && parts[0]?.startsWith('file:')) return fileURLToPath(parts[0])
      }
    }
    return undefined
  }
  function collectBinding(pattern, expression, path = []) {
    if (!ts.isObjectBindingPattern(pattern)) return
    const excluded = pattern.elements.filter(binding => !binding.dotDotDotToken).map(binding => binding.propertyName ?? binding.name)
    for (const binding of pattern.elements) {
      const step = binding.dotDotDotToken ? { excluded } : { name: binding.propertyName ?? binding.name }
      const next = [...path, step]
      if (ts.isIdentifier(binding.name)) memberBindings.set(binding, { expression, path: next })
      else collectBinding(binding.name, expression, next)
    }
  }
  function collect(node) {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const binding of node.importClause.namedBindings.elements) aliases.set(binding, (binding.propertyName ?? binding.name).text)
    }
    if (ts.isVariableDeclaration(node)) {
      if (ts.isIdentifier(node.name) && node.initializer) bindings.set(node, node.initializer)
      else collectBinding(node.name, node.initializer)
    }
    if ((ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node)) && node.initializer) bindings.set(node, node.initializer)
    if (ts.isFunctionLike(node) && node.body) bindings.set(node, node)
    ts.forEachChild(node, collect)
  }
  collect(tree)

  function memberReference(owner, key, seen) {
    if (!owner || key === undefined || owner.excluded?.has(key)) return undefined
    if (owner.source) return { source: owner.source, path: [...owner.path, key] }
    if (ts.isFunctionLike(owner.node) && ['bind', 'call', 'apply'].includes(key)) return { ...owner, adapter: key }
    return declarationReference(graph.propertyDeclaration(owner.node, key, owner.instance), seen)
  }
  function declarationReference(resolved, seen) {
    if (!resolved || seen.has(resolved)) return undefined
    const next = new Set([...seen, resolved]), member = memberBindings.get(resolved)
    if (member) {
      let owner = reference(member.expression, next)
      for (const step of member.path) {
        if (!owner) return undefined
        if (step.excluded) {
          const keys = step.excluded.map(name => staticPropertyName(name, next))
          if (keys.some(key => key === undefined)) return undefined
          owner = { ...owner, excluded: new Set([...(owner.excluded ?? []), ...keys]) }
        } else owner = memberReference(owner, staticPropertyName(step.name, next), next)
      }
      return owner
    }
    if (ts.isFunctionLike(resolved) && resolved.body) return { node: resolved }
    if (ts.isClassDeclaration(resolved) || ts.isClassExpression(resolved)) return { node: resolved }
    if (bindings.has(resolved)) return reference(bindings.get(resolved), next)
    if (ts.isImportSpecifier(resolved) || ts.isNamespaceImport(resolved) || ts.isImportClause(resolved)) {
      const imported = graph.modules.get(file).imports.get(resolved.name.text)
      if (imported) return { source: imported.source, path: imported.name === '*' || (imported.source === '@deepseek-ai/schemastery' && imported.name === 'default') ? [] : [imported.name] }
    }
    return undefined
  }
  function reference(node, seen = new Set()) {
    node = unwrapExpression(node)
    if (!node) return undefined
    if (ts.isAwaitExpression(node)) return reference(node.expression, seen)
    if (ts.isObjectLiteralExpression(node) || ts.isClassExpression(node) || (ts.isFunctionLike(node) && node.body)) return { node }
    if (ts.isIdentifier(node)) {
      const resolved = graph.declaration(node)
      if (!resolved && node.text === 'require') return { source: 'node:module', path: ['require'] }
      return declarationReference(resolved, seen)
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return memberReference(reference(node.expression, seen), property(node, seen), seen)
    if (ts.isNewExpression(node)) {
      const constructor = reference(node.expression, seen)
      if (constructor?.node && (ts.isClassDeclaration(constructor.node) || ts.isClassExpression(constructor.node))) return { node: constructor.node, instance: true }
    }
    if (ts.isCallExpression(node)) {
      const expression = unwrapExpression(node.expression), value = literal(node.arguments[0], seen)
      if (expression.kind === ts.SyntaxKind.ImportKeyword) return value === undefined ? undefined : { source: value, path: [] }
      const loader = reference(expression, seen)
      if (loader && ['node:module', 'module'].includes(loader.source)) {
        if (loader.path.join('.') === 'createRequire') return { source: 'node:module', path: ['require'] }
        if (loader.path.join('.') === 'require') return value === undefined ? undefined : { source: value, path: [] }
      }
      if (loader?.source && loader.path.at(-1) === 'bind') return { source: loader.source, path: loader.path.slice(0, -1) }
      if (loader?.adapter === 'bind') return { node: loader.node }
    }
    return undefined
  }
  function contractParser(node) {
    const target = reference(node)
    return target?.source === '#contracts' && target.path.join('.') === 'contracts.parse'
  }
  function callbackUsesContractParser(node, seen = new Set()) {
    node = unwrapExpression(node)
    if (!node || seen.has(node)) return false
    const next = new Set([...seen, node])
    if (contractParser(node)) return true
    const target = reference(node)
    if (target?.node && ts.isFunctionLike(target.node) && target.node !== node && callbackUsesContractParser(target.node, next)) return true
    let found = false
    function scan(child) {
      if (found || ts.isTypeNode(child)) return
      if (ts.isIdentifier(child) && ((child.parent.name === child && !ts.isShorthandPropertyAssignment(child.parent))
        || (ts.isBindingElement(child.parent) && child.parent.propertyName === child))) return
      if (ts.isFunctionLike(child) && child !== node) {
        if (child.name && ts.isComputedPropertyName(child.name)) scan(child.name.expression)
        return
      }
      const implementation = reference(child)?.node
      if (contractParser(child) || (implementation && ts.isFunctionLike(implementation) && callbackUsesContractParser(implementation, next))) {
        found = true
        return
      }
      if (ts.isReturnStatement(child) && child.expression && callbackUsesContractParser(child.expression, next)) {
        found = true
        return
      }
      if (ts.isCallExpression(child) || ts.isNewExpression(child)) {
        if (callbackUsesContractParser(child.expression, next)
          || child.arguments?.some(argument => callbackUsesContractParser(argument, next))) {
          found = true
          return
        }
      }
      ts.forEachChild(child, scan)
    }
    scan(node)
    return found
  }
  function wrapsContractParser(node) {
    const target = reference(node.expression)
    if (target?.source !== '@deepseek-ai/schemastery') return false
    const name = target.path.at(-1)
    if (!['transform', 'extend'].includes(name) || !target.path.slice(0, -1).every(part => part === 'default')) return false
    return callbackUsesContractParser(node.arguments[1])
  }

  function add(node, reason) {
    problems.push(`${file}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}: ${reason}`)
  }
  function privateAccess(value, importing = false) {
    if (value === '#contracts') return !importing
    if (value.startsWith('#contracts/')) return true
    const mapped = manifest.imports?.[value]
    if (typeof mapped === 'string' && isInside(resolve(root, mapped))) return true
    if (value.startsWith('file:')) return isInside(fileURLToPath(value))
    return isInside(resolve(root, dirname(file), value)) || isInside(resolve(root, value))
      || /(?:^|\/)src\/contracts(?:\/|$)/.test(value.replaceAll('\\', '/'))
  }
  function insidePluginConfig(node) {
    if (!pluginConfigurationOwners.has(file)) return false
    for (let current = node; current && current !== tree; current = current.parent) {
      if (ts.isVariableDeclaration(current)) return ts.isIdentifier(current.name) && current.name.text === 'Config'
    }
    return false
  }
  function isCallTarget(node) {
    return ts.isCallExpression(node.parent) && node.parent.expression === node
  }
  function visit(node) {
    if (graph.modules.get(file).positions.has(node.getStart(tree))) add(node, 'Contract API and raw types must not be forwarded; import #contracts at the consumer')
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const value = literal(node.moduleSpecifier)
      if (value && privateAccess(value, true)) add(node, 'Import the public #contracts module only')
      if (value && value !== '#contracts' && graph.exported(file, value)) add(node, 'Import #contracts directly instead of a forwarding module')
      if (localRules && !configuration && value === '@deepseek-ai/schemastery' && !pluginConfigurationOwners.has(file)) add(node, 'Contract declarations belong to #contracts; configuration declarations require a configuration owner')
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      const value = literal(node.argument.literal)
      if (value && privateAccess(value, true)) add(node, 'Import public contract types through #contracts')
      if (value && value !== '#contracts' && graph.exported(file, value)) add(node, 'Import contract types directly through #contracts')
    }
    if (ts.isCallExpression(node)) {
      if (wrapsContractParser(node)) add(node, "Mount contracts.bind(contractId, 'settings') instead of wrapping contracts.parse in a Schema callback")
      const name = callName(node.expression), value = literal(node.arguments[0])
      if (value && ['import', 'require', 'resolve'].includes(name) && privateAccess(value, true)) add(node, 'Import the public #contracts module only')
      if (value && value !== '#contracts' && ['import', 'require'].includes(name) && graph.exported(file, value)) add(node, 'Import #contracts directly instead of a forwarding module')
      if (value && fileReaders.has(name) && privateAccess(value)) add(node, 'Contract definitions are module-private')
    }
    if (localRules && !configuration && !insidePluginConfig(node)) {
      const key = property(node)
      if (schemaFields.has(key) && !(key === 'list' && (isCallTarget(node) || property(node.expression) === 'prototype'))) add(node, 'Schema traversal belongs to #contracts')
      if (projectionFields.has(key)) add(node, 'Schema projection belongs to #contracts')
      if (ts.isPropertyAssignment(node) && projectionFields.has(staticPropertyName(node.name))) add(node, 'Schema projection belongs to #contracts')
      if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && schemaFields.has(staticPropertyName(node.propertyName ?? node.name))) add(node, 'Schema traversal belongs to #contracts')
      if (pluginConfigurationOwners.has(file) && ts.isIdentifier(node) && node.text === 'Schema' && !ts.isImportClause(node.parent)) add(node, 'Plugin configuration Schema is restricted to Config')
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return problems
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = inspectContractConsumers()
  if (problems.length) {
    process.stderr.write(`${problems.join('\n')}\n`)
    process.exitCode = 1
  }
}
