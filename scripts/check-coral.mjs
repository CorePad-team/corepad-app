// Brand rule: coral (#E0574F) is the single event dot. It may appear only in the token definition
// and the .dot-event rule of src/style.css. Anything else fails the build.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
const hits = []
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|css|html)$/.test(f)) check(p) } }
function check(p) {
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    if (!/e0574f|--coral|coral/i.test(line)) return
    const allowed = p.endsWith('style.css') && (/^\s*--coral: #E0574F;/.test(line) || /^\.dot-event \{/.test(line))
    if (!allowed) hits.push(`${p}:${i + 1}: ${line.trim()}`)
  })
}
walk('src'); check('index.html')
if (hits.length) { console.error('Coral outside the event dot:\n' + hits.join('\n')); process.exit(1) }
console.log('coral check: ok (event dot only)')
