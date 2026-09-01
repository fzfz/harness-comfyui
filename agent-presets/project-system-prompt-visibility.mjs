export const name = 'harness-comfyui-project-system-prompt-visibility'
export const inject = ['systemPrompt']

function hiddenSectionNameSet(config) {
  if (
    config === null
    || typeof config !== 'object'
    || Array.isArray(config)
    || Object.keys(config).length !== 1
    || !Object.hasOwn(config, 'hiddenSectionNames')
  ) {
    throw new TypeError('project system prompt visibility config must contain only hiddenSectionNames')
  }
  if (!Array.isArray(config.hiddenSectionNames) || config.hiddenSectionNames.length === 0) {
    throw new TypeError('project system prompt visibility hiddenSectionNames must be a non-empty array')
  }
  const names = new Set()
  for (const sectionName of config.hiddenSectionNames) {
    if (typeof sectionName !== 'string' || sectionName.trim().length === 0) {
      throw new TypeError('project system prompt visibility section names must be non-empty strings')
    }
    if (names.has(sectionName)) {
      throw new TypeError(`project system prompt visibility section name ${JSON.stringify(sectionName)} is duplicated`)
    }
    names.add(sectionName)
  }
  return names
}

export function apply(ctx, config) {
  const hiddenSectionNames = hiddenSectionNameSet(config)
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    return {
      ...assembled,
      sections: assembled.sections.filter(section => !hiddenSectionNames.has(section.name)),
    }
  })
}
