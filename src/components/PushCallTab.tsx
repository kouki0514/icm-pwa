import { useState, useCallback } from 'react'
import HandGrid from './HandGrid'
import { topXPercent, calcPushEV, combosInRange, type PushCallResult, type PotInfo } from '../lib/pushFold'

interface Player { id: number; name: string; stack: number }
interface Props { players: Player[]; prizes: number[] }

export default function PushCallTab({ players, prizes }: Props) {
  const [heroIdx, setHeroIdx] = useState(0)
  const [heroPosition, setHeroPosition] = useState<PotInfo['heroPosition']>('other')
  // ポット情報
  const [sbAmount, setSbAmount] = useState(100)
  const [bbAmount, setBbAmount] = useState(200)
  const [anteAmount, setAnteAmount] = useState(0)
  // Push: 複数Villain選択
  const [pushVillainIndices, setPushVillainIndices] = useState<number[]>([1])
  // Push: 各VillainのコールレンジPct (index -> pct)
  const [pushVillainPcts, setPushVillainPcts] = useState<Map<number, number>>(new Map([[1, 30]]))
  // Call: 1人選択
  const [callVillainIdx, setCallVillainIdx] = useState(1)
  const [callVillainPct, setCallVillainPct] = useState(40)
  const [callVillainRange, setCallVillainRange] = useState<Set<string>>(new Set(topXPercent(40)))
  const [rangeInputMode, setRangeInputMode] = useState<'grid' | 'pct'>('pct')
  const [mode, setMode] = useState<'push' | 'call'>('push')
  const [results, setResults] = useState<PushCallResult[] | null>(null)
  const [computing, setComputing] = useState(false)
  const [progress, setProgress] = useState(0)

  const heroStack = players[heroIdx]?.stack ?? 0
  const totalChips = players.reduce((a, b) => a + b.stack, 0)

  // Push時の実効スタック（複数Villainの場合は最小）
  const pushEffectiveStack = pushVillainIndices.length > 0
    ? Math.min(heroStack, ...pushVillainIndices.map(i => players[i]?.stack ?? 0))
    : 0
  // Call時の実効スタック
  const callEffectiveStack = Math.min(heroStack, players[callVillainIdx]?.stack ?? 0)

  const effectiveStack = mode === 'push' ? pushEffectiveStack : callEffectiveStack
  const callVillainStack = players[callVillainIdx]?.stack ?? 0
  const heroIsCovered = mode === 'call'
    ? callVillainStack >= heroStack
    : pushVillainIndices.some(i => (players[i]?.stack ?? 0) >= heroStack)

  // Push Villain選択トグル
  const togglePushVillain = (idx: number) => {
    setPushVillainIndices(prev => {
      if (prev.includes(idx)) {
        if (prev.length === 1) return prev // 最低1人
        return prev.filter(i => i !== idx)
      } else {
        const next = [...prev, idx].sort((a, b) => a - b)
        // 新規追加分のデフォルトpct設定
        setPushVillainPcts(pcts => {
          const m = new Map(pcts)
          if (!m.has(idx)) m.set(idx, 30)
          return m
        })
        return next
      }
    })
    setResults(null)
  }

  const setPushVillainPct = (idx: number, pct: number) => {
    setPushVillainPcts(prev => {
      const m = new Map(prev)
      m.set(idx, pct)
      return m
    })
    setResults(null)
  }

  const run = useCallback(async () => {
    if (players.length < 2) return
    if (mode === 'push' && pushVillainIndices.includes(heroIdx)) return
    if (mode === 'call' && callVillainIdx === heroIdx) return
    setComputing(true)
    setProgress(0)
    const stacks = players.map(p => p.stack)
    const validPrizes = prizes.filter(p => p > 0).sort((a, b) => b - a)
    const pot: PotInfo = {
      sb: sbAmount,
      bb: bbAmount,
      ante: anteAmount,
      numPlayers: players.length,
      heroPosition,
    }

    try {
      if (mode === 'push') {
        const rangesMap = new Map<number, string[]>()
        for (const vIdx of pushVillainIndices) {
          const pct = pushVillainPcts.get(vIdx) ?? 30
          rangesMap.set(vIdx, topXPercent(pct))
        }
        const res = await calcPushEV(heroIdx, pushVillainIndices, stacks, validPrizes, rangesMap, pot, (pct) => setProgress(pct))
        setResults(res)
      } else {
        const rangesMap = new Map<number, string[]>([[callVillainIdx, [...callVillainRange]]])
        const res = await calcPushEV(heroIdx, [callVillainIdx], stacks, validPrizes, rangesMap, pot, (pct) => setProgress(pct))
        setResults(res)
      }
    } finally {
      setComputing(false)
      setProgress(100)
    }
  }, [heroIdx, heroPosition, sbAmount, bbAmount, anteAmount, pushVillainIndices, pushVillainPcts, callVillainIdx, callVillainRange, mode, players, prizes])

  const colorMap = new Map<string, 'push' | 'call' | 'both' | 'none'>()
  if (results) {
    for (const r of results) {
      const active = mode === 'push' ? r.shouldPush : r.shouldCall
      colorMap.set(r.hand, active ? (mode === 'push' ? 'push' : 'call') : 'none')
    }
  }

  const goodCount = results?.filter(r => mode === 'push' ? r.shouldPush : r.shouldCall).length ?? 0

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex gap-2 mb-4">
          {(['push', 'call'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setResults(null) }}
              className={`flex-1 font-mono text-sm py-2 rounded-lg border transition-colors ${mode === m ? 'bg-gold-400 text-surface-900 border-gold-400' : 'border-surface-600 text-slate-400 hover:text-slate-200'}`}>
              {m === 'push' ? 'Push分析' : 'Call分析'}
            </button>
          ))}
        </div>

        {/* Hero 選択 */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-3">
            <label className="font-mono text-xs text-slate-500 w-16 flex-shrink-0">Hero</label>
            <select className="input-base" value={heroIdx} onChange={e => { setHeroIdx(+e.target.value); setResults(null) }}>
              {players.map((p, i) => (
                <option key={p.id} value={i}>{p.name} — {p.stack.toLocaleString()} ({((p.stack / totalChips) * 100).toFixed(1)}%)</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="font-mono text-xs text-slate-500 w-16 flex-shrink-0">Position</label>
            <select className="input-base" value={heroPosition} onChange={e => { setHeroPosition(e.target.value as PotInfo['heroPosition']); setResults(null) }}>
              <option value="other">その他（BTN/UTGなど）</option>
              <option value="sb">SB</option>
              <option value="bb">BB</option>
            </select>
          </div>
        </div>

        {/* ポット情報 */}
        <div className="mb-4">
          <div className="font-mono text-xs text-slate-500 mb-2">ブラインド・アンティ</div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="font-mono text-xs text-slate-500 block mb-1">SB</label>
              <input type="number" min={0} value={sbAmount}
                onChange={e => { setSbAmount(Math.max(0, +e.target.value)); setResults(null) }}
                className="input-base w-full" />
            </div>
            <div>
              <label className="font-mono text-xs text-slate-500 block mb-1">BB</label>
              <input type="number" min={0} value={bbAmount}
                onChange={e => { setBbAmount(Math.max(0, +e.target.value)); setResults(null) }}
                className="input-base w-full" />
            </div>
            <div>
              <label className="font-mono text-xs text-slate-500 block mb-1">Ante（/人）</label>
              <input type="number" min={0} value={anteAmount}
                onChange={e => { setAnteAmount(Math.max(0, +e.target.value)); setResults(null) }}
                className="input-base w-full" />
            </div>
          </div>
          <div className="font-mono text-xs text-slate-600 mt-1">
            ポット合計: {(sbAmount + bbAmount + anteAmount * players.length).toLocaleString()} chips
            {heroPosition === 'sb' && <span className="text-slate-500 ml-2">（SBのためフォールド獲得: {(bbAmount + anteAmount * players.length).toLocaleString()}）</span>}
            {heroPosition === 'bb' && <span className="text-slate-500 ml-2">（BBのためフォールド獲得: {(sbAmount + anteAmount * players.length).toLocaleString()}）</span>}
          </div>
        </div>

        {/* Villain 選択 */}
        <div className="mb-4">
          {mode === 'push' ? (
            /* Push: 複数Villain チェックボックス + 個別スライダー */
            <div className="space-y-2">
              <label className="font-mono text-xs text-slate-500">Villain（コール判断するプレイヤー）</label>
              {players.map((p, i) => {
                if (i === heroIdx) return null
                const checked = pushVillainIndices.includes(i)
                const pct = pushVillainPcts.get(i) ?? 30
                const range = topXPercent(pct)
                return (
                  <div key={p.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`push-villain-${i}`}
                        checked={checked}
                        onChange={() => togglePushVillain(i)}
                        className="accent-gold-400"
                      />
                      <label htmlFor={`push-villain-${i}`} className="font-mono text-xs text-slate-200 cursor-pointer flex-1">
                        {p.name} — {p.stack.toLocaleString()} ({((p.stack / totalChips) * 100).toFixed(1)}%)
                      </label>
                    </div>
                    {checked && (
                      <div className="flex items-center gap-3 pl-5">
                        <input type="range" min={1} max={100} step={1} value={pct}
                          onChange={e => setPushVillainPct(i, +e.target.value)}
                          className="flex-1" />
                        <span className="font-mono text-xs text-gold-400 w-36 text-right flex-shrink-0">
                          コールTop {pct}% ({combosInRange(range)}c)
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            /* Call: 1人選択 */
            <div className="flex items-center gap-3">
              <label className="font-mono text-xs text-slate-500 w-16 flex-shrink-0">Villain</label>
              <select className="input-base" value={callVillainIdx} onChange={e => { setCallVillainIdx(+e.target.value); setResults(null) }}>
                {players.map((p, i) => i !== heroIdx && (
                  <option key={p.id} value={i}>{p.name} — {p.stack.toLocaleString()} ({((p.stack / totalChips) * 100).toFixed(1)}%)</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* カバー状況 */}
        <div className={`rounded-lg px-3 py-2 mb-4 font-mono text-xs flex items-center gap-3 ${heroIsCovered ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'}`}>
          <span>{heroIsCovered ? '⚠ Villainにカバーされている' : '✓ HeroがVillainをカバー'}</span>
          <span className="text-slate-500 ml-auto">effective: {effectiveStack.toLocaleString()} chips</span>
        </div>

        {/* Call分析のVillainプッシュレンジ */}
        {mode === 'call' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs text-slate-500">Villain プッシュレンジ</span>
              <div className="flex gap-1">
                {(['pct', 'grid'] as const).map(m => (
                  <button key={m} onClick={() => setRangeInputMode(m)}
                    className={`font-mono text-xs px-2 py-0.5 rounded border transition-colors ${rangeInputMode === m ? 'border-gold-400 text-gold-400' : 'border-surface-600 text-slate-500'}`}>
                    {m === 'pct' ? '%指定' : 'グリッド'}
                  </button>
                ))}
              </div>
            </div>
            {rangeInputMode === 'pct' ? (
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={100} step={1} value={callVillainPct}
                  onChange={e => { const v = +e.target.value; setCallVillainPct(v); setCallVillainRange(new Set(topXPercent(v))); setResults(null) }}
                  className="flex-1" />
                <span className="font-mono text-sm text-gold-400 w-36 text-right flex-shrink-0">
                  Top {callVillainPct}% ({combosInRange([...callVillainRange])}c)
                </span>
              </div>
            ) : (
              <HandGrid selected={callVillainRange} onChange={s => { setCallVillainRange(s); setResults(null) }} />
            )}
          </div>
        )}
      </div>

      <button onClick={run} disabled={computing || (mode === 'push' ? pushVillainIndices.includes(heroIdx) : callVillainIdx === heroIdx)}
        className="btn-primary w-full disabled:opacity-50 disabled:cursor-wait">
        {computing ? `計算中... ${progress}%` : '全169ハンドを計算'}
      </button>

      {computing && (
        <div className="h-1 bg-surface-700 rounded-full overflow-hidden">
          <div className="h-full bg-gold-400 transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      )}

      {results && (
        <div className="card space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-surface-800 rounded-lg p-3">
              <div className="font-mono text-xs text-slate-500 mb-1">{mode === 'push' ? 'Push推奨' : 'Call推奨'}</div>
              <div className="font-mono text-xl font-semibold text-green-400">{goodCount} / 169</div>
            </div>
            <div className="bg-surface-800 rounded-lg p-3">
              <div className="font-mono text-xs text-slate-500 mb-1">
                {mode === 'push' ? `Villain (${pushVillainIndices.length}人)` : 'Villain範囲'}
              </div>
              <div className="font-mono text-xl font-semibold text-gold-400">
                {mode === 'push'
                  ? pushVillainIndices.map(i => `${pushVillainPcts.get(i) ?? 30}%`).join('/')
                  : `Top ${callVillainPct}%`
                }
              </div>
            </div>
            <div className="bg-surface-800 rounded-lg p-3">
              <div className="font-mono text-xs text-slate-500 mb-1">実効スタック</div>
              <div className="font-mono text-sm font-semibold text-slate-100">{effectiveStack.toLocaleString()}</div>
            </div>
          </div>

          <div>
            <div className="font-mono text-xs text-slate-500 mb-2">
              {mode === 'push' ? '緑 = Push有利' : '黄 = Call有利'}　グレー = フォールド推奨
            </div>
            <HandGrid selected={new Set()} onChange={() => {}} colorMap={colorMap} readOnly />
          </div>

          <div>
            <div className="font-mono text-xs text-slate-500 mb-2">EV上位ハンド</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {[...results]
                .filter(r => mode === 'push' ? r.shouldPush : r.shouldCall)
                .sort((a, b) => mode === 'push' ? b.pushEV - a.pushEV : b.callEV - a.callEV)
                .slice(0, 20)
                .map(r => {
                  const ev = mode === 'push' ? r.pushEV : r.callEV
                  return (
                    <div key={r.hand} className="flex items-center gap-3 py-1 border-b border-surface-600 last:border-0">
                      <span className="font-mono text-xs text-slate-100 w-10">{r.hand}</span>
                      <span className="font-mono text-xs text-slate-500 w-16">eq {(r.equity * 100).toFixed(1)}%</span>
                      <div className="flex-1 h-1 bg-surface-600 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, Math.abs(ev) * 5000)}%` }} />
                      </div>
                      <span className={`font-mono text-xs w-20 text-right ${ev > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {ev > 0 ? '+' : ''}{(ev * 100).toFixed(3)}%
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
