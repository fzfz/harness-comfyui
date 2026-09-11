import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('../../src/client/styles.css', import.meta.url), 'utf8')

function declarations(selector: string): string {
  const marker = `${selector} {`
  const start = styles.indexOf(marker)
  if (start === -1) throw new Error(`Missing CSS rule: ${selector}`)
  const bodyStart = start + marker.length
  const end = styles.indexOf('}', bodyStart)
  if (end === -1) throw new Error(`Unterminated CSS rule: ${selector}`)
  return styles.slice(bodyStart, end)
}

describe('catalog image gallery layout', () => {
  it('keeps both arrow icons centered while the displayed image changes', () => {
    const stage = declarations('.harness-comfyui-gallery-stage')
    const arrow = declarations('.harness-comfyui-gallery-arrow')

    expect(stage).toContain('align-items: stretch;')
    expect(stage).toContain('overflow: hidden;')
    expect(arrow).toContain('align-self: center;')
    expect(arrow).toContain('line-height: 0;')
  })

  it('keeps the modal header visible while only the gallery body consumes remaining height', () => {
    const header = declarations('.harness-comfyui-gallery-modal-content > :first-child')
    const body = declarations('.harness-comfyui-gallery-modal-content > :last-child')

    expect(header).toContain('flex: 0 0 auto;')
    expect(body).toContain('flex: 1 1 auto;')
    expect(body).toContain('min-height: 0;')
    expect(body).toContain('overflow: hidden;')
  })

  it('fits the complete image into the available gallery width and height', () => {
    const currentImage = declarations('.harness-comfyui-gallery-current')
    const image = declarations('.harness-comfyui-gallery-current img')

    expect(currentImage).toContain('overflow: auto;')
    expect(image).toContain('width: 100%;')
    expect(image).toContain('height: 100%;')
    expect(image).toContain('object-fit: contain;')
    expect(image).toContain('margin: auto;')
  })
})
