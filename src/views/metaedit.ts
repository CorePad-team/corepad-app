import { h, toast, errMsg } from '../ui'
import { mined } from '../chain'
import { normalizeLinks, uploadFile, uploadMeta, setMetadata, refreshMeta, type TokenMeta } from '../meta'
import type { Launch } from '../chain'

/**
 * Creator-only editor: uploads new images if chosen, keeps the current ones otherwise, writes a new
 * JSON document and points CorePadMetadata at it (one signature). The registry rejects anyone else.
 */
export function metaEditor(L: Launch, current: () => TokenMeta | null, onDone: () => void): HTMLElement {
  const cur = current()
  const file = (label: string) => {
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml', 'aria-label': label }) as HTMLInputElement
    return { input, el: h('div', { class: 'field' }, h('span', { class: 'flabel' }, h('span', null, label), h('span', null, 'up to 5 MB')), input) }
  }
  const logo = file('Logo'), banner = file('Banner')
  const desc = h('textarea', { maxlength: '500', rows: '3', 'aria-label': 'Description' }) as HTMLTextAreaElement
  desc.value = cur?.description ?? ''
  const site = h('input', { 'aria-label': 'Website', placeholder: 'example.com', value: cur?.website ?? '' }) as HTMLInputElement
  const xh = h('input', { 'aria-label': 'X', placeholder: '@handle', value: cur?.twitter ?? '' }) as HTMLInputElement
  const tg = h('input', { 'aria-label': 'Telegram', placeholder: '@group', value: cur?.telegram ?? '' }) as HTMLInputElement
  const save = h('button', { class: 'btn solid', type: 'button' }, 'Save metadata')
  const note = h('p', { class: 'hint', style: 'margin:0' }, 'One signature: CorePadMetadata.set(' + L.id + ', uri). Only the creator of this launch can call it.')
  save.addEventListener('click', async () => {
    const links = normalizeLinks({ website: site.value, twitter: xh.value, telegram: tg.value })
    if (links.problem) { toast(links.problem, true); return }
    for (const f of [logo.input.files?.[0], banner.input.files?.[0]]) if (f && f.size > 5 * 1024 * 1024) { toast(`${f.name}: over 5 MB`, true); return }
    save.setAttribute('disabled', '')
    try {
      save.textContent = 'Uploading…'
      const sym = L.symbol.toLowerCase()
      const lf = logo.input.files?.[0], bf = banner.input.files?.[0]
      const [image, bannerUrl] = await Promise.all([
        lf ? uploadFile('logo', lf, `${sym}.${(lf.name.split('.').pop() || 'img').toLowerCase()}`) : Promise.resolve(cur?.image),
        bf ? uploadFile('banner', bf, `${sym}.${(bf.name.split('.').pop() || 'img').toLowerCase()}`) : Promise.resolve(cur?.banner),
      ])
      const uri = await uploadMeta({ name: L.name, symbol: L.symbol, description: desc.value, image, banner: bannerUrl, ...links })
      save.textContent = 'Confirm in wallet…'
      await mined(await setMetadata(L.id, uri))
      await refreshMeta([L.id], true)
      toast('Metadata saved')
      onDone()
    } catch (e) { toast(errMsg(e), true, 9000) }
    finally { save.removeAttribute('disabled'); save.textContent = 'Save metadata' }
  })
  return h('details', { class: 'other medit' },
    h('summary', null, h('span', { class: 'label' }, h('b', null, 'Edit metadata')), h('span', { class: 'hint' }, 'you created this launch')),
    h('div', { class: 'otherbody' },
      h('div', { class: 'field2' }, logo.el, banner.el),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, h('span', null, 'Description')), h('div', { class: 'input ta' }, desc)),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, h('span', null, 'Website')), h('div', { class: 'input' }, site)),
      h('div', { class: 'field2' },
        h('div', { class: 'field' }, h('span', { class: 'flabel' }, h('span', null, 'X')), h('div', { class: 'input' }, xh)),
        h('div', { class: 'field' }, h('span', { class: 'flabel' }, h('span', null, 'Telegram')), h('div', { class: 'input' }, tg))),
      save, note))
}
