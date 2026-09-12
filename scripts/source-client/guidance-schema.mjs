export function parseSourceGuidance(value) {
  for (const [kind, fields] of Object.entries({ semantic: ['invocation', 'help', 'search', 'searchEmpty', 'searchUnstructured', 'resolve', 'discovery', 'error'], source: ['invocation', 'help', 'empty', 'unstructured', 'instance', 'template-bundle', 'discovery', 'error'] })) {
    for (const field of fields) if (typeof value?.[kind]?.[field] !== 'string' || !value[kind][field]) throw new TypeError(`CLI guidance ${kind}.${field} requires text`)
  }
  return value
}
