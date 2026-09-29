function at(root, path) {
  let value = root
  for (const key of path) value = value[key]
  return value
}

class FakeNode {
  constructor(root, path) { this.root = root; this.path = path }
  get value() { return at(this.root, this.path) }
  set value(value) {
    const parent = at(this.root, this.path.slice(0, -1))
    parent[this.path.at(-1)] = value
  }
  get items() { return this.value }
  set items(items) { this.value = items }
  get tag() { return this.value?.__jsExpr === undefined ? undefined : 'tag:yaml.org,2002:js' }
  get(key) { return new FakeNode(this.root, [...this.path, key]) }
  set(key, value) { this.value[key] = unwrap(value) }
  clone() { return new FakeNode({ value: structuredClone(this.value) }, ['value']) }
}

function unwrap(value) {
  if (value instanceof FakeNode) return structuredClone(value.value)
  if (Array.isArray(value)) return value.map(unwrap)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unwrap(item)]))
  return value
}

function parseDocument(source) {
  const value = JSON.parse(source)
  const document = {
    errors: [],
    toJS: () => value,
    getIn(path) { return at(value, path) === undefined ? undefined : new FakeNode(value, path) },
    setIn(path, entry) {
      let parent = value
      for (const key of path.slice(0, -1)) {
        parent[key] ??= {}
        parent = parent[key]
      }
      parent[path.at(-1)] = unwrap(entry)
    },
    createNode: unwrap,
    contents: {
      get items() { return value },
      add(entry) { value.push(entry) },
    },
    toString: () => `${JSON.stringify(value, null, 2)}\n`,
  }
  return document
}

exports.parse = JSON.parse
exports.stringify = value => `${JSON.stringify(value, null, 2)}\n`
exports.parseDocument = parseDocument
