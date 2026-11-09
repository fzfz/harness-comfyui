import yaml from 'js-yaml'

const schema = yaml.DEFAULT_SCHEMA.extend(new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar', construct: expression => ({ __jsExpr: expression }),
}))

export function parsePresetYaml(source) {
  return yaml.load(source, { schema })
}
