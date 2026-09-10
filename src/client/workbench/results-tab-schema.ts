import Schema from '@deepseek-ai/schemastery'

export const resultsTabSchema = Schema.object({
  id: Schema.string().pattern(/^[a-z0-9-]+\/[a-z0-9-]+$/).required(),
  kind: Schema.string().pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).required(),
  title: Schema.string().pattern(/\S/).required(),
}).required()
