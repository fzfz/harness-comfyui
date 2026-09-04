import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const oldSkillDirectory = resolve(root, '.agents/skills/krea2-anime-prompt-skill')
const skillDirectory = resolve(root, '.agents/skills/krea2-anime-prompt-builder')
const skillPath = resolve(skillDirectory, 'SKILL.md')
const read = (path) => readFileSync(path, 'utf8')

describe('krea2-anime-prompt-builder project Skill contract', () => {
  it('uses the renamed canonical directory and removes every retired generator asset', () => {
    expect(existsSync(oldSkillDirectory)).toBe(false)
    expect(statSync(skillDirectory).isDirectory()).toBe(true)
    const retiredAssets = [
      'scripts/gen_anime_v2.py',
      'scripts/gen_anime_v1.py',
      'scripts/selftest.py',
      'references/anime_big_lib.py',
      'references/hanfu_master.py',
      'references/_verify_all.py',
      'references/danbooru_tag_defs.txt',
      'references/en_anime_guides.txt',
    ]
    for (const relativePath of retiredAssets) {
      expect(existsSync(resolve(skillDirectory, relativePath)), relativePath).toBe(false)
    }
    expect(existsSync(resolve(skillDirectory, 'references/motion-migration-constraints.md'))).toBe(true)
    expect(existsSync(resolve(skillDirectory, 'motion-migration-constraints.md'))).toBe(false)
  })

  it('keeps the Skill name equal to the directory name with only supported frontmatter keys', () => {
    const skill = read(skillPath)
    const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/u)

    expect(frontmatter).not.toBeNull()
    const lines = frontmatter[1].split('\n')
    expect(lines.map((line) => line.slice(0, line.indexOf(':')))).toEqual(['name', 'description'])
    expect(lines[0]).toBe(`name: ${skillDirectory.split('/').at(-1)}`)
    expect(lines[1].slice('description: '.length).trim().length).toBeGreaterThan(0)
  })

  it('provides UI metadata for the renamed Skill', () => {
    const metadata = read(resolve(skillDirectory, 'agents/openai.yaml'))

    expect(metadata).toContain('display_name: "Krea2 Anime Prompt Builder"')
    expect(metadata).toContain('short_description: "构建单条 Krea2 动漫角色展示与动作迁移源图提示词"')
    expect(metadata).toContain('$krea2-anime-prompt-builder')
    expect(metadata).not.toContain('$krea2-anime-prompt-skill')
  })

  it('resolves every Skill-owned reference linked from SKILL.md', () => {
    const skill = read(skillPath)
    const linkedReferences = [...skill.matchAll(/`(references\/[^`]+)`/gu)].map((match) => match[1])

    expect(linkedReferences.length).toBeGreaterThan(0)
    for (const relativePath of new Set(linkedReferences)) {
      expect(existsSync(resolve(skillDirectory, relativePath)), relativePath).toBe(true)
    }
  })

  it('does not expose a retired Python generator from the Skill entry', () => {
    const skill = read(skillPath)
    expect(skill).not.toMatch(/gen_anime_v[12]\.py|生成器 v2|自然语言生成器 v2|\.py\b/gu)
  })
})
