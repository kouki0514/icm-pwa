import { ALL_HANDS } from '../lib/pushFold'

const RANKS = 'AKQJT98765432'

interface Props {
  selected: Set<string>
  onChange: (s: Set<string>) => void
  colorMap?: Map<string, 'push' | 'call' | 'both' | 'none'>
  readOnly?: boolean
  label?: string
}

export default function HandGrid({ selected, onChange, colorMap, readOnly, label }: Props) {
  const toggle = (hand: string) => {
    if (readOnly) return
    const next = new Set(selected)
    if (next.has(hand)) next.delete(hand)
    else next.add(hand)
    onChange(next)
  }

  const cellColor = (hand: string): string => {
    if (colorMap) {
      const v = colorMap.get(hand)
      if (v === 'both') return 'bg-blue-500 text-white'
      if (v === 'push') return 'bg-green-500 text-white'
      if (v === 'call') return 'bg-yellow-500 text-white'
      if (v === 'none') return 'bg-surface-800 text-slate-600'
    }
    if (selected.has(hand)) return 'bg-gold-400 text-surface-900'
    const isPair = hand.length === 2
    const isSuited = hand.endsWith('s')
    if (isPair) return 'bg-surface-600 text-slate-300'
    if (isSuited) return 'bg-surface-700 text-slate-400'
    return 'bg-surface-800 text-slate-500'
  }

  return (
    <div>
      {label && <div className="font-mono text-xs text-slate-500 mb-1">{label}</div>}
      <div className="grid gap-0.5" style={{gridTemplateColumns:'repeat(13,1fr)'}}>
        {RANKS.split('').map((r1, i) =>
          RANKS.split('').map((r2, j) => {
            let hand: string
            if (i === j) hand = r1+r2
            else if (j > i) hand = r1+r2+'s'
            else hand = r2+r1+'o'
            return (
              <button
                key={hand}
                onClick={() => toggle(hand)}
                className={`${cellColor(hand)} rounded text-center transition-colors ${readOnly ? 'cursor-default' : 'hover:opacity-80 active:scale-95'}`}
                style={{fontSize:'9px', padding:'2px 0', lineHeight:'1.4'}}
                title={hand}
              >
                {hand.replace('o','').replace('s','')}
              </button>
            )
          })
        )}
      </div>
      {!readOnly && (
        <div className="flex gap-2 mt-2">
          <button onClick={() => onChange(new Set(ALL_HANDS))}
            className="font-mono text-xs text-slate-500 hover:text-slate-300 border border-surface-600 rounded px-2 py-1">全選択</button>
          <button onClick={() => onChange(new Set())}
            className="font-mono text-xs text-slate-500 hover:text-slate-300 border border-surface-600 rounded px-2 py-1">クリア</button>
        </div>
      )}
    </div>
  )
}
