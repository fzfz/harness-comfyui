import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const workbenchRoot = `document.querySelector('[data-experiment-workbench-root]')?.shadowRoot`
const viewportWidths = [1024, 1180, 1181, 1280, 1440, 1920]

export async function verifyWorkbenchPageLayout(page, { workspaceId, evidenceDirectory, waitForValue }) {
  const viewport = await page.evaluate(`({ width: innerWidth, height: innerHeight })`)
  const measurements = []
  const errors = []
  let opened = false
  let metricsOverridden = false
  let sidebarCollapsed = false
  try {
    await waitForValue(page, `(() => {
      const entry = document.querySelector('button[aria-label="实验工作台"]')
      if (!entry?.checkVisibility()) return false
      if (entry.getAttribute('aria-pressed') !== 'true') entry.click()
      return true
    })()`, value => value === true)
    opened = true
    sidebarCollapsed = await waitForValue(page, `(() => {
      const visibleButton = label => [...document.querySelectorAll('button[aria-label="' + label + '"]')]
        .find(button => button.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
      const collapse = visibleButton('收起侧边栏')
      if (collapse) { collapse.click(); return true }
      return visibleButton('打开侧边栏') ? false : null
    })()`, value => typeof value === 'boolean')
    await waitForValue(page, `[...document.querySelectorAll('button[aria-label="打开侧边栏"]')]
      .some(button => button.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))`, value => value === true)
    await waitForValue(page, `(() => {
      const select = (${workbenchRoot})?.querySelector('select[aria-label="切换工作区"]')
      if (!select || ![...select.options].some(option => option.value === ${JSON.stringify(workspaceId)})) return false
      if (select.value !== ${JSON.stringify(workspaceId)}) {
        select.value = ${JSON.stringify(workspaceId)}
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
      return true
    })()`, value => value === true)
    await waitForValue(page, `(() => {
      const root = ${workbenchRoot}
      const button = [...(root?.querySelectorAll('.workbar button') ?? [])]
        .find(element => element.textContent.trim() === '新建工作')
      if (!button || root.querySelector('[aria-label="加载工作台"]')) return false
      button.click()
      return true
    })()`, value => value === true)
    await waitForValue(page, `(() => {
      const root = ${workbenchRoot}
      const name = root?.querySelector('input[aria-label="工作名称"]')
      const goal = root?.querySelector('textarea[aria-label="总目标"]')
      if (!name || !goal) return false
      name.value = 'Desktop layout regression'
      goal.value = 'Verify column geometry while navigating work pages.'
      name.form.requestSubmit()
      return true
    })()`, value => value === true)
    await waitForValue(page, `(() => {
      const root = ${workbenchRoot}
      return !root?.querySelector('[role="dialog"]') && !!root?.querySelector('.layout .center')
    })()`, value => value === true)

    for (const width of viewportWidths) {
      await page.command('Emulation.setDeviceMetricsOverride', {
        width, height: 1000, deviceScaleFactor: 1, mobile: false,
      })
      metricsOverridden = true
      await waitForValue(page, 'innerWidth', value => value === width)
      await page.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
      for (const label of ['任务', '资源', '经验', '收藏', '任务']) {
        await page.evaluate(`((${workbenchRoot}).querySelector('.nav button[aria-label="${label}"]').click(), true)`)
        if (label === '资源') {
          await waitForValue(page, `(() => {
            const category = (${workbenchRoot})?.querySelector('[data-resource-kind="comfyui-template"]')
            if (!category) return false
            if (category.getAttribute('aria-pressed') !== 'true') category.click()
            return true
          })()`, value => value === true)
          await waitForValue(page, `(() => {
            const root = ${workbenchRoot}
            const images = [...root.querySelectorAll('.catalog-card .catalog-cover img')]
            return {
              ready: images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0),
              images: images.map(image => ({ src: image.src, complete: image.complete, width: image.naturalWidth })),
              errors: [...root.querySelectorAll('.catalog-list-panel [role="alert"]')].map(element => element.textContent),
            }
          })()`, value => value.ready === true, 10_000)
        }
        const geometry = await waitForValue(page, `(async () => {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          const root = (${workbenchRoot})?.querySelector('.experiment-workbench')
          const nav = root?.querySelector('nav[aria-label="工作导航"]')
          const active = nav?.querySelector('button.active')
          if (active?.getAttribute('aria-label') !== ${JSON.stringify(label)}) return null
          const bounds = element => {
            if (!element) return null
            const rect = element.getBoundingClientRect()
            return Object.fromEntries(['x', 'y', 'width', 'height', 'right'].map(key => [key, rect[key]]))
          }
          const appearance = element => {
            if (!element) return null
            const style = getComputedStyle(element)
            return Object.fromEntries(['color', 'backgroundColor', 'borderLeftColor', 'borderRightColor', 'borderBottomColor', 'borderBottomWidth', 'fontSize', 'fontWeight'].map(key => [key, style[key]]))
          }
          const sidebar = root.querySelector('.layout > .sidebar, .catalog-kinds')
          const center = root.querySelector('.layout > .center')
          const inspector = root.querySelector('.layout > .inspector')
          return {
            viewport: { width: innerWidth, height: innerHeight }, page: ${JSON.stringify(label)},
            layout: bounds(root.querySelector('.layout')),
            sidebar: bounds(sidebar), center: bounds(center), inspector: bounds(inspector),
            nav: bounds(nav),
            buttons: [...nav.querySelectorAll('button')].map(button => ({ label: button.getAttribute('aria-label'), ...bounds(button) })),
            appearance: { sidebar: appearance(sidebar), center: appearance(center), inspector: appearance(inspector), activeNavigation: appearance(active) },
            overflow: { client: root.clientWidth, scroll: root.scrollWidth },
            resource: ${JSON.stringify(label)} === '资源' ? (() => {
              const style = (element, properties) => {
                const computed = getComputedStyle(element)
                return Object.fromEntries(properties.map(property => [property, computed[property]]))
              }
              const layout = root.querySelector('.layout')
              const resourceSidebar = root.querySelector('.resource-sidebar')
              return {
                sidebarFirst: resourceSidebar?.parentElement === layout && layout.firstElementChild === resourceSidebar,
                categories: [...root.querySelectorAll('.resource-kind-nav > button')].map(button => ({
                  active: button.getAttribute('aria-pressed') === 'true',
                  style: style(button, ['backgroundColor', 'color', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
                    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderColor', 'borderRadius',
                    'fontSize', 'fontWeight', 'lineHeight', 'gap', 'display', 'alignItems', 'justifyContent']),
                })),
                filters: [...root.querySelectorAll('.catalog-filters select')].map(select => ({ label: select.getAttribute('aria-label'), ...bounds(select) })),
                covers: [...root.querySelectorAll('.catalog-card .catalog-cover img')].map(image => ({
                  image: bounds(image), cover: bounds(image.parentElement), naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
                  style: style(image, ['objectFit', 'backgroundColor', 'display']),
                  coverStyle: style(image.parentElement, ['position']),
                })),
                descriptions: [...root.querySelectorAll('.catalog-card p')].map(element =>
                  style(element, ['minHeight', 'webkitLineClamp', 'webkitBoxOrient', 'overflow'])),
                rows: [...root.querySelectorAll('.catalog-card .row')].map(element => style(element, ['flexWrap', 'gap'])),
                metadata: [...root.querySelectorAll('.catalog-card .row > small')].map(element => style(element, ['overflowWrap'])),
              }
            })() : null,
          }
        })()`, value => value !== null)
        measurements.push(geometry)
        if (label === '资源' && width === viewportWidths.at(-1)) {
          geometry.resource.detail = await measureResourceDetail(page, waitForValue)
        }
      }
    }

    for (const width of viewportWidths) {
      const rows = measurements.filter(row => row.viewport.width === width)
      const baseline = rows[0]
      for (const row of rows) {
        const message = `${width}px ${row.page}`
        for (const column of ['sidebar', 'center', 'inspector']) {
          assert.ok(row[column]?.width > 0, `${message}: ${column} is visible`)
          for (const key of ['x', 'width']) {
            assert.ok(Math.abs(row[column][key] - baseline[column][key]) <= 0.5,
              `${message}: ${column}.${key} ${row[column][key]} differs from task page ${baseline[column][key]}`)
          }
        }
        assert.ok(Math.abs(row.sidebar.x - row.layout.x) <= 0.5, `${message}: sidebar starts at the layout edge`)
        assert.ok(Math.abs(row.sidebar.right - row.center.x) <= 0.5, `${message}: center follows the sidebar`)
        assert.ok(Math.abs(row.center.right - row.inspector.x) <= 0.5, `${message}: inspector follows the center`)
        assert.ok(Math.abs(row.inspector.right - row.layout.right) <= 0.5, `${message}: inspector ends at the layout edge`)
        for (const key of ['x', 'y', 'width']) {
          assert.ok(Math.abs(row.nav[key] - baseline.nav[key]) <= 0.5, `${message}: navigation ${key} stays fixed`)
        }
        assert.deepEqual(row.buttons.map(button => button.label), baseline.buttons.map(button => button.label), `${message}: navigation buttons remain available`)
        row.buttons.forEach((button, index) => {
          for (const key of ['x', 'y', 'width']) {
            assert.ok(Math.abs(button[key] - baseline.buttons[index][key]) <= 0.5,
              `${message}: ${button.label} navigation ${key} stays fixed`)
          }
        })
        assert.deepEqual(row.appearance, baseline.appearance, `${message}: column and selected navigation appearance stays fixed`)
        assert.ok(row.overflow.scroll <= row.overflow.client, `${message}: workbench has no horizontal overflow`)
        if (row.resource) assertResourceAppearance(row.resource, width, message)
      }
    }
  } catch (error) {
    errors.push(error)
  } finally {
    const cleanup = [
      () => writeFile(join(evidenceDirectory, 'official-business-workbench-layout.json'), JSON.stringify(measurements, null, 2) + '\n', { mode: 0o600 }),
    ]
    if (metricsOverridden) cleanup.push(async () => {
      await page.command('Emulation.clearDeviceMetricsOverride')
      await waitForValue(page, '({ width: innerWidth, height: innerHeight })',
        value => value.width === viewport.width && value.height === viewport.height)
    })
    if (opened) cleanup.push(() => page.evaluate(`(() => {
      const entry = document.querySelector('button[aria-label="实验工作台"]')
      if (entry?.getAttribute('aria-pressed') === 'true') entry.click()
      return true
    })()`))
    if (sidebarCollapsed) cleanup.push(() => waitForValue(page, `(() => {
      const visibleButton = label => [...document.querySelectorAll('button[aria-label="' + label + '"]')]
        .find(button => button.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
      if (visibleButton('收起侧边栏')) return true
      visibleButton('打开侧边栏')?.click()
      return false
    })()`, value => value === true))
    for (const restore of cleanup) {
      try { await restore() } catch (error) { errors.push(error) }
    }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, 'Workbench layout verification and cleanup reported failures', { cause: errors[0] })
}

async function measureResourceDetail(page, waitForValue) {
  await page.evaluate(`((${workbenchRoot}).querySelector('.catalog-card button[aria-label^="查看详情 "]').click(), true)`)
  const detail = await waitForValue(page, `(() => {
    const root = ${workbenchRoot}
    const cover = root.querySelector('.catalog-detail .detail-cover')
    const image = cover?.querySelector('img')
    const rows = [...root.querySelectorAll('.catalog-detail dl > div')].filter(row => row.checkVisibility())
    if (!image?.complete || !image.naturalWidth || rows.length === 0) return null
    const computed = getComputedStyle(image)
    return {
      coverPosition: getComputedStyle(cover).position,
      imageStyle: { objectFit: computed.objectFit, backgroundColor: computed.backgroundColor, display: computed.display },
      rows: rows.map(row => {
        const label = row.querySelector('dt'), value = row.querySelector('dd')
        const labelBounds = label.getBoundingClientRect(), valueBounds = value.getBoundingClientRect()
        const style = getComputedStyle(value)
        return { labelWidth: labelBounds.width, gap: valueBounds.x - labelBounds.right,
          valueRight: valueBounds.right, rowRight: row.getBoundingClientRect().right,
          lineHeight: style.lineHeight, fontSize: style.fontSize }
      }),
    }
  })()`, value => value !== null, 10_000)
  await page.evaluate(`(() => {
    const root = ${workbenchRoot}
    ;[...root.querySelectorAll('.catalog-detail .row button')]
      .find(button => button.textContent.trim() === '返回资源列表').click()
    return true
  })()`)
  await waitForValue(page, `(${workbenchRoot}).querySelectorAll('.catalog-card').length`, count => count > 0)
  return detail
}

function assertResourceAppearance(resource, width, message) {
  assert.equal(resource.sidebarFirst, true, `${message}: resource sidebar occupies the first layout column`)
  assert.ok(resource.categories.some(button => button.active), `${message}: a resource category is selected`)
  assert.ok(resource.categories.some(button => !button.active), `${message}: inactive resource categories remain available`)
  for (const button of resource.categories) {
    assert.deepEqual(button.style, {
      backgroundColor: button.active ? 'rgb(234, 242, 233)' : 'rgba(0, 0, 0, 0)',
      color: button.active ? 'rgb(53, 108, 82)' : 'rgb(38, 53, 47)',
      paddingTop: '13px', paddingRight: '12px', paddingBottom: '13px', paddingLeft: '12px',
      borderTopWidth: '1px', borderRightWidth: '1px', borderBottomWidth: '1px', borderLeftWidth: '1px',
      borderColor: button.active ? 'rgb(213, 225, 211)' : 'rgba(0, 0, 0, 0)', borderRadius: '6px',
      fontSize: '12px', fontWeight: button.active ? '600' : '400', lineHeight: '18px', gap: '12px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }, `${message}: resource category padding, borders, typography and colors match the prototype`)
  }
  assert.equal(resource.filters.length, 2, `${message}: base model and generation model filters are visible`)
  resource.filters.forEach((filter, index) => {
    assert.ok(filter.width > 0 && filter.width <= 260.5, `${message}: ${filter.label} width is at most 260px`)
    if (index === 0) return
    const previous = resource.filters[index - 1]
    if (width <= 1180) {
      assert.ok(Math.abs(filter.x - previous.x) <= 0.5 && filter.y >= previous.y + previous.height,
        `${message}: resource filters stack at and below 1180px`)
    } else {
      assert.ok(Math.abs(filter.y - previous.y) <= 0.5 && filter.x >= previous.right,
        `${message}: resource filters share a row above 1180px`)
    }
  })
  const imageStyle = { objectFit: 'contain', backgroundColor: 'rgb(237, 241, 235)', display: 'block' }
  assert.ok(resource.covers.length > 0, `${message}: catalog cover images loaded from the source`)
  for (const cover of resource.covers) {
    assert.deepEqual(cover.style, imageStyle, `${message}: catalog cover image preserves its proportions and background`)
    assert.deepEqual(cover.coverStyle, { position: 'relative' }, `${message}: catalog cover contains positioned content`)
    assert.ok(cover.naturalWidth > 0 && cover.naturalHeight > 0, `${message}: catalog image has real image dimensions`)
    assert.ok(cover.image.width <= cover.cover.width + 0.5 && cover.image.height <= cover.cover.height + 0.5,
      `${message}: catalog image stays inside its cover`)
  }
  assert.ok(resource.descriptions.length > 0 && resource.rows.length > 0 && resource.metadata.length > 0,
    `${message}: catalog card descriptions, actions and metadata are rendered`)
  for (const description of resource.descriptions) assert.deepEqual(description, {
    minHeight: '52px', webkitLineClamp: '3', webkitBoxOrient: 'vertical', overflow: 'hidden',
  }, `${message}: catalog description reserves 52px and truncates after three lines`)
  for (const row of resource.rows) assert.deepEqual(row, { flexWrap: 'wrap', gap: '6px' },
    `${message}: catalog card rows wrap with a 6px gap`)
  for (const metadata of resource.metadata) assert.deepEqual(metadata, { overflowWrap: 'anywhere' },
    `${message}: catalog metadata wraps inside the card`)
  if (resource.detail) {
    assert.equal(resource.detail.coverPosition, 'relative', `${message}: detail cover contains positioned content`)
    assert.deepEqual(resource.detail.imageStyle, imageStyle, `${message}: detail image preserves its proportions and background`)
    for (const row of resource.detail.rows) {
      assert.ok(Math.abs(row.labelWidth - 110) <= 0.5 && Math.abs(row.gap - 16) <= 0.5,
        `${message}: detail fields reserve 110px labels and a 16px gap`)
      assert.ok(row.valueRight <= row.rowRight + 0.5, `${message}: detail values stay inside the field row`)
      assert.ok(Math.abs(Number.parseFloat(row.lineHeight) / Number.parseFloat(row.fontSize) - 1.9) <= 0.01,
        `${message}: detail values use 1.9 line height`)
    }
  }
}
