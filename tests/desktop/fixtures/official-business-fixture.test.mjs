import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import officialBusinessFixtureJson from './official-business-fixture.json' with { type: 'json' }
import { parseOfficialBusinessFixture } from './official-business-schema.mjs'
import { startOfficialBusinessServices } from './official-business-services.mjs'

describe('official Desktop business fixture schema', () => {
  it('requires distinct browser evidence filenames within the run evidence directory', () => {
    const fixture = structuredClone(officialBusinessFixtureJson)
    fixture.browserEvidenceFiles = {
      saved: 'official-business-browser-settings.json',
      screenshot: 'official-business-browser-settings.png',
      restarted: 'official-business-browser-settings-after-restart.json',
    }
    expect(parseOfficialBusinessFixture(fixture)).toEqual(fixture)
    for (const path of ['../outside.json', '/outside.json', '', 'wrong-extension.txt']) {
      const invalid = structuredClone(fixture)
      invalid.browserEvidenceFiles.saved = path
      expect(() => parseOfficialBusinessFixture(invalid)).toThrow(/browser evidence/u)
    }
    const duplicate = structuredClone(fixture)
    duplicate.browserEvidenceFiles.restarted = duplicate.browserEvidenceFiles.saved
    expect(() => parseOfficialBusinessFixture(duplicate)).toThrow(/browser evidence/u)
  })

  it('accepts the controlled fixture and rejects unsafe or inconsistent boundaries', () => {
    const fixture = parseOfficialBusinessFixture(officialBusinessFixtureJson)
    expect(fixture).toEqual(officialBusinessFixtureJson)

    expect(() => parseOfficialBusinessFixture({ ...officialBusinessFixtureJson, unexpected: true }))
      .toThrow(/unexpected/u)

    const duplicateSkillMarker = structuredClone(officialBusinessFixtureJson)
    duplicateSkillMarker.skills.userMarker = duplicateSkillMarker.skills.workspaceMarker
    expect(() => parseOfficialBusinessFixture(duplicateSkillMarker)).toThrow(/Skill markers must be unique/u)

    const markerLeakedIntoPrompt = structuredClone(officialBusinessFixtureJson)
    markerLeakedIntoPrompt.skills.markerRequest += ` ${markerLeakedIntoPrompt.skills.workspaceMarker}`
    expect(() => parseOfficialBusinessFixture(markerLeakedIntoPrompt)).toThrow(/absent from metadata and the marker request/u)

    const missingSkillInMarkerRequest = structuredClone(officialBusinessFixtureJson)
    missingSkillInMarkerRequest.skills.markerRequest = `Read ${missingSkillInMarkerRequest.skills.uniqueWorkspaceName}.`
    expect(() => parseOfficialBusinessFixture(missingSkillInMarkerRequest)).toThrow(/name both scoped Skills/u)

    const unsupportedProvider = structuredClone(officialBusinessFixtureJson)
    unsupportedProvider.provider.api = 'openai-responses'
    expect(() => parseOfficialBusinessFixture(unsupportedProvider)).toThrow(/openai-completions/u)

    const duplicateTitles = structuredClone(officialBusinessFixtureJson)
    duplicateTitles.sessions.switchTitle = duplicateTitles.sessions.primaryTitle
    expect(() => parseOfficialBusinessFixture(duplicateTitles)).toThrow(/session titles must be unique/u)

    const invalidDimensions = structuredClone(officialBusinessFixtureJson)
    invalidDimensions.catalog.images.small.width = 0
    expect(() => parseOfficialBusinessFixture(invalidDimensions)).toThrow(/positive integer/u)

    const invalidSeed = structuredClone(officialBusinessFixtureJson)
    invalidSeed.generation.seed = 0
    expect(() => parseOfficialBusinessFixture(invalidSeed)).toThrow(/generation.seed.*positive integer/u)

    const outOfRangeSeed = structuredClone(officialBusinessFixtureJson)
    outOfRangeSeed.generation.seed = 1_000_000_000_000_000
    expect(() => parseOfficialBusinessFixture(outOfRangeSeed)).toThrow(/object_info maximum/u)

    const unsafeOutputPath = structuredClone(officialBusinessFixtureJson)
    unsafeOutputPath.generation.filename = '../outside.png'
    expect(() => parseOfficialBusinessFixture(unsafeOutputPath)).toThrow(/output path is invalid/u)

    const unpairedWorkflowLink = structuredClone(officialBusinessFixtureJson)
    unpairedWorkflowLink.generation.workflow.links[0][1] = 99
    expect(() => parseOfficialBusinessFixture(unpairedWorkflowLink)).toThrow(/does not match its node ports/u)

    const wrongWorkflowPort = structuredClone(officialBusinessFixtureJson)
    wrongWorkflowPort.generation.workflow.links[0][2] = 9
    expect(() => parseOfficialBusinessFixture(wrongWorkflowPort)).toThrow(/mismatched port indexes or types/u)

    const wrongOutputNode = structuredClone(officialBusinessFixtureJson)
    wrongOutputNode.generation.outputNodeId = '2'
    expect(() => parseOfficialBusinessFixture(wrongOutputNode)).toThrow(/outputNodeId must identify an output node/u)

    const unexpectedGenerationField = structuredClone(officialBusinessFixtureJson)
    unexpectedGenerationField.generation.secret = 'not-accepted'
    expect(() => parseOfficialBusinessFixture(unexpectedGenerationField)).toThrow(/unexpected secret/u)
  })

  it('defines controlled text and image model capabilities for image reader defaults', () => {
    const fixture = parseOfficialBusinessFixture(officialBusinessFixtureJson)
    expect(fixture.provider.models.promptCapture.input).toEqual(['text'])
    expect(fixture.provider.models.vision.input).toEqual(['text', 'image'])
    expect(fixture.imageReader.defaultModel).toEqual({
      provider: fixture.provider.id,
      model: fixture.provider.models.vision.id,
    })
    expect(fixture.imageReader.alternateProvider.model.input).toEqual(['text', 'image'])
    expect(fixture.imageReader.alternateProvider.id).not.toBe(fixture.provider.id)

    const textModelMarkedAsVision = structuredClone(officialBusinessFixtureJson)
    textModelMarkedAsVision.provider.models.promptCapture.input = ['text', 'image']
    expect(() => parseOfficialBusinessFixture(textModelMarkedAsVision)).toThrow(/prompt-capture model input/u)

    const primaryModelMissingImage = structuredClone(officialBusinessFixtureJson)
    primaryModelMissingImage.provider.models.vision.input = ['text']
    expect(() => parseOfficialBusinessFixture(primaryModelMissingImage)).toThrow(/models\.vision input/u)

    const alternateModelMissingImage = structuredClone(officialBusinessFixtureJson)
    alternateModelMissingImage.imageReader.alternateProvider.model.input = ['text']
    expect(() => parseOfficialBusinessFixture(alternateModelMissingImage)).toThrow(/alternateProvider\.model input/u)

    const defaultModelDoesNotMatch = structuredClone(officialBusinessFixtureJson)
    defaultModelDoesNotMatch.imageReader.defaultModel.model = fixture.provider.modelId
    expect(() => parseOfficialBusinessFixture(defaultModelDoesNotMatch)).toThrow(/default model must select the controlled vision model/u)

    const providerIdIsNotDistinct = structuredClone(officialBusinessFixtureJson)
    providerIdIsNotDistinct.imageReader.alternateProvider.id = fixture.provider.id
    expect(() => parseOfficialBusinessFixture(providerIdIsNotDistinct)).toThrow(/provider ids must be distinct/u)

    const modelIdIsNotDistinct = structuredClone(officialBusinessFixtureJson)
    modelIdIsNotDistinct.imageReader.alternateProvider.model.id = fixture.provider.models.vision.id
    expect(() => parseOfficialBusinessFixture(modelIdIsNotDistinct)).toThrow(/model ids must be distinct/u)
  })

  it('selects matching model requests while preserving unrelated queued and future requests', async () => {
    const fixture = parseOfficialBusinessFixture(officialBusinessFixtureJson)
    const services = await startOfficialBusinessServices(fixture)
    const postRequest = async content => {
      const response = await fetch(`${services.baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: fixture.provider.modelId,
          stream: true,
          messages: [{ role: 'user', content }],
        }),
      })
      expect(response.status).toBe(200)
      await response.text()
    }

    try {
      await postRequest('unrelated queued request')
      await postRequest('queued generation request')
      const queuedGeneration = await services.nextRequestWhere(request =>
        request.body.messages.some(message => message.content === 'queued generation request'))
      expect(queuedGeneration.body.messages[0].content).toBe('queued generation request')
      expect(services.requests.map(request => request.body.messages[0].content))
        .toEqual(['unrelated queued request'])

      const futureSkillRequest = services.nextRequestWhere(request =>
        request.body.messages.some(message => message.content === 'future skill request'))
      await postRequest('future skill request')
      expect((await futureSkillRequest).body.messages[0].content).toBe('future skill request')
      expect(services.requests.map(request => request.body.messages[0].content))
        .toEqual(['unrelated queued request'])
      expect((await services.nextRequest()).body.messages[0].content).toBe('unrelated queued request')
      expect(services.requests).toEqual([])
      await expect(services.nextRequestWhere(null)).rejects.toThrow(/predicate must be a function/u)
      await expect(services.nextRequestWhere(() => false, 1))
        .rejects.toThrow(/timed out waiting for a controlled model request/u)
      expect(services.requests).toEqual([])
      await postRequest('request after timed-out selector')
      expect((await services.nextRequest()).body.messages[0].content).toBe('request after timed-out selector')
    } finally {
      await services.close()
    }
  })

  it('serves isolated Source, LiteGraph frontend, object_info, job, history, and media contracts', async () => {
    const fixture = parseOfficialBusinessFixture(officialBusinessFixtureJson)
    const services = await startOfficialBusinessServices(fixture)
    try {
      const discovery = await fetch(`${services.origin}/internal/comfyui-source`).then(response => response.json())
      expect(discovery.paths).toMatchObject({
        '/internal/comfyui-source/instances/{instance_id}': { get: { operationId: 'getComfyuiInstanceSourceForHost' } },
        '/internal/comfyui-source/templates/{template_id}/bundle': { get: { operationId: 'getComfyuiTemplateBundleForHost' } },
      })
      const instance = await fetch(`${services.origin}/internal/comfyui-source/instances/1`).then(response => response.json())
      expect(instance.results[0]).toMatchObject({ id: '1', credential_type: 'none', url: services.origin })
      const bundle = await fetch(`${services.origin}/internal/comfyui-source/templates/1/bundle`).then(response => response.json())
      expect(bundle.results[0]).toMatchObject({ id: '1', title: fixture.generation.templateTitle, workflow_json: fixture.generation.workflow })

      const frontend = await fetch(services.origin).then(response => response.text())
      expect(frontend).toContain('LiteGraph.registerNodeType')
      expect(frontend).toContain('globalThis.comfyAPI = { app: { app } }')
      expect(frontend).toContain('async loadGraphData(workflow)')
      expect(frontend).toContain('async graphToPrompt()')
      expect(await fetch(`${services.origin}/object_info`).then(response => response.json())).toEqual(fixture.generation.objectInfo)

      const modelRequest = await fetch(`${services.baseURL}/chat/completions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: fixture.provider.modelId,
          stream: true,
          messages: [{ role: 'user', content: fixture.generation.triggerPrompt }],
          tools: [{ type: 'function', function: { name: 'generate_with_comfyui' } }],
        }),
      })
      expect(modelRequest.headers.get('content-type')).toContain('text/event-stream')
      const modelEvents = (await modelRequest.text()).split('\n')
        .filter(line => line.startsWith('data: ') && line !== 'data: [DONE]')
        .map(line => JSON.parse(line.slice('data: '.length)))
      const generationCall = modelEvents.flatMap(event => event.choices?.[0]?.delta?.tool_calls ?? [])
        .find(call => call.function?.name === 'generate_with_comfyui')
      expect(JSON.parse(generationCall.function.arguments)).toMatchObject({
        title: fixture.generation.runTitle,
        instance_id: fixture.generation.instanceId,
        template_id: fixture.generation.templateId,
        parameters: { positive_prompt: fixture.generation.positivePrompt, seed: fixture.generation.seed },
      })
      expect((await services.nextRequest()).body.messages[0].content).toBe(fixture.generation.triggerPrompt)
      expect(services.requestLog).toHaveLength(1)
      expect(services.requestLog[0]).toMatchObject({
        path: '/v1/chat/completions',
        body: { model: fixture.provider.modelId },
      })

      const requestSkillMarkerTask = async (messages, tools = [{
        type: 'function', function: { name: 'skill', parameters: { type: 'object' } },
      }]) => {
        const response = await fetch(`${services.baseURL}/chat/completions`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: fixture.provider.modelId,
            stream: true,
            messages,
            tools,
          }),
        })
        const events = (await response.text()).split('\n')
          .filter(line => line.startsWith('data: ') && line !== 'data: [DONE]')
          .map(line => JSON.parse(line.slice('data: '.length)))
        const delta = events.map(event => event.choices?.[0]?.delta ?? {})
        return { delta, request: await services.nextRequest() }
      }
      const markerPrompt = [
        { role: 'user', content: fixture.skills.markerRequest },
      ]
      const workspaceSkill = await requestSkillMarkerTask(markerPrompt)
      expect(workspaceSkill.request.body.messages[0].content).toBe(fixture.skills.markerRequest)
      expect(JSON.parse(workspaceSkill.delta.find(item => item.tool_calls)?.tool_calls[0].function.arguments))
        .toEqual({ name: fixture.skills.uniqueWorkspaceName })
      const workspaceContent = `<skill_content name="${fixture.skills.uniqueWorkspaceName}">\n${fixture.skills.workspaceMarker}\n</skill_content>`
      const userSkill = await requestSkillMarkerTask([
        ...markerPrompt,
        { role: 'assistant', tool_calls: [{ id: 'workspace-skill', type: 'function', function: { name: 'skill', arguments: JSON.stringify({ name: fixture.skills.uniqueWorkspaceName }) } }] },
        { role: 'tool', tool_call_id: 'workspace-skill', content: workspaceContent },
      ])
      expect(JSON.parse(userSkill.delta.find(item => item.tool_calls)?.tool_calls[0].function.arguments))
        .toEqual({ name: fixture.skills.userName })
      const userContent = `<skill_content name="${fixture.skills.userName}">\n${fixture.skills.userMarker}\n</skill_content>`
      const completedSkillTask = await requestSkillMarkerTask([
        ...markerPrompt,
        { role: 'assistant', tool_calls: [{ id: 'workspace-skill', type: 'function', function: { name: 'skill', arguments: JSON.stringify({ name: fixture.skills.uniqueWorkspaceName }) } }] },
        { role: 'tool', tool_call_id: 'workspace-skill', content: workspaceContent },
        { role: 'assistant', tool_calls: [{ id: 'user-skill', type: 'function', function: { name: 'skill', arguments: JSON.stringify({ name: fixture.skills.userName }) } }] },
        { role: 'tool', tool_call_id: 'user-skill', content: userContent },
      ])
      expect(completedSkillTask.delta.map(item => item.content ?? '').join(''))
        .toBe(`${fixture.skills.workspaceMarker}\n${fixture.skills.userMarker}`)
      const missingMarkers = await requestSkillMarkerTask([
        { role: 'user', content: fixture.skills.markerRequest },
      ], [])
      expect(missingMarkers.delta.map(item => item.content ?? '').join(''))
        .toBe('The requested verification Skills were not loaded through the skill tool.')
      expect(services.skillToolCalls).toEqual([
        { name: 'skill', arguments: { name: fixture.skills.uniqueWorkspaceName } },
        { name: 'skill', arguments: { name: fixture.skills.userName } },
      ])
      expect(services.requestLog).toHaveLength(5)

      const promptId = randomUUID()
      const accepted = await fetch(`${services.origin}/prompt`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt_id: promptId, prompt: { '3': { class_type: 'SaveImage', inputs: {} } } }),
      }).then(response => response.json())
      expect(accepted).toEqual({ prompt_id: promptId })
      const firstPoll = await fetch(`${services.origin}/api/jobs/${promptId}`).then(response => response.json())
      const completed = await fetch(`${services.origin}/api/jobs/${promptId}`).then(response => response.json())
      expect(firstPoll).toMatchObject({ id: promptId, status: 'pending' })
      expect(completed).toMatchObject({ id: promptId, status: 'completed' })

      const history = await services.readHistory(promptId)
      expect(history[promptId]).toMatchObject({
        status: { status_str: 'success', completed: true },
        outputs: { [fixture.generation.outputNodeId]: { images: [expect.objectContaining({ filename: fixture.generation.filename })] } },
      })
      expect(services.historyRequestCount).toBe(1)
      const media = await fetch(`${services.origin}/view?filename=${encodeURIComponent(fixture.generation.filename)}&subfolder=${encodeURIComponent(fixture.generation.subfolder)}&type=output`)
      expect(media.headers.get('content-type')).toContain('image/png')
      expect([...new Uint8Array(await media.arrayBuffer()).slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
      const invalidMedia = await fetch(`${services.origin}/view?filename=outside.png&subfolder=&type=output`)
      expect(invalidMedia.status).toBe(404)
    } finally {
      await services.close()
    }
  })
})
