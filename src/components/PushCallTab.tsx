import { useState, useCallback } from 'react'
import HandGrid from './HandGrid'
import { topXPercent, calcPushEV, combosInRange, type PushCallResult } from '../lib/pushFold'

interface Player { id: number; name: string; stack: number }
interface Props { players: Player[]; prizes: number[] }

export default function PushCallTab({ players, prizes }: Props) {
  const [heroIdx, setHeroIdx] = useState(0)
  const [villainIdx, setVillainIdx] = useState(1)
  const [villainCallRange, setVillainCallRange] = useState<Set<string>>(new Set(topXPercent(30)))
  const [villainPushRange, setVillainPushRange] = useState<Set<string>>(new Set(topXPercent(40)))
  const [rangeInputMode, setRangeInputMode] = useState<'grid' | 'pct'>('pct')
  const [callPct, setCallPct] = useState(30)
  const [pushPct, setPushPct] = useState(40)
  const [mode, setMode] = useState<'push' | 'call'>('push')
  const [results, setResults] = useState<PushCallResult[] | null>(null)
  const [computing, setComputing] = useState(false)
  const [progress, setProgress] = useState(0)

  const heroStack = players[heroIdx]?.stack ?? 0
  const villainStack = players[villainIdx]?.stack ?? 0
  const effectiveStack = Math.min(heroStack, villainStack)
  const heroIsCovered = villainStack >= heroStack
  const totalChips = players.reduce((a, b) => a + b.stack, 0)

  const run = useCallback(async () => {
    if (players.length < 2 || heroIdx === villainIdx) return
    setComputing(true)
    setProgress(0)
    const stacks = players.map(p => p.stack)
    const validPrizes = prizes.filter(p => p > 0).sort((a, b) => b - a)
    const range = mode === 'push' ? [...villainCallRange] : [...villainPushRange]
    try {
      const res = await calcPushEV(heroIdx, villainIdx, stacks, validPrizes, range, (pct) => setProgress(pct))
      setResults(res)
    } finally {
      setComputing(false)
      setProgress(100)
    }
  }, [heroIdx, villainIdx, villainCallRange, villainPushRange, mode, players, prizes])

  const colorMap = new Map<string, 'push' | 'call' | 'both' | 'none'>()
  if (results) {
    for (const r of results) {
      const active = mode === 'push' ? r.shouldPush : r.shouldCall
      colorMap.set(r.hand, active ? (mode === 'push' ? 'push' : 'call') : 'none')
    }
  }

  const activeRange = mode === 'push' ? villainCallRange : villainPushRange
  const setActiveRange = mode === 'push' ? setVillainCallRange : setVillainPushRange
  const activePct = mode === 'push' ? callPct : pushPct
  const setActivePct = mode === 'push' ? setCallPct : setPushPct
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

        {/* Hero / Villain 選択 */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-3">
            <label className="font-mono text-xs text-slate-500 w-16 flex-shrink-0">Hero</label>
            <select className="input-base" value={heroIdx} onChange={e => { setHeroIdx(+e.target.value); setResults(null) }}>
              {players.map((p, i) => i !== villainIdx && (
                <option key={p.id} value={i}>{p.name} — {p.stack.toLocaleString()} ({((p.stack / totalChips) * 100).toFixed(1)}%)</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="font-mono text-xs text-slate-500 w-16 flex-shrink-0">Villain</label>
            <select className="input-base" value={villainIdx} onChange={e => { setVillainIdx(+e.target.value); setResults(null) }}>
              {players.map((p, i) => i !== heroIdx && (
                <option key={p.id} value={i}>{p.name} — {p.stack.toLocaleString()} ({((p.stack / totalChips) * 100).toFixed(1)}%)</option>
              ))}
            </select>
          </div>
        </div>

        {/* カバー状況 */}
        <div className={`rounded-lg px-3 py-2 mb-4 font-mono text-xs flex items-center gap-3 ${heroIsCovered ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'}`}>
          <span>{heroIsCovered ? '⚠ Villainにカバーされている' : '✓ HeroがVillainをカバー'}</span>
          <span className="text-slate-500 ml-auto">effective: {effectiveStack.toLocaleString()} chips</span>
        </div>

        {/* Villain レンジ */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-slate-500">
              {mode === 'push' ? 'Villain コールレンジ' : 'Villain プッシュレンジ'}
            </span>
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
              <input type="range" min={1} max={100} step={1} value={activePct}
                onChange={e => { const v = +e.target.value; setActivePct(v); setActiveRange(new Set(topXPercent(v))); setResults(null) }}
                className="flex-1" />
              <span className="font-mono text-sm text-gold-400 w-36 text-right flex-shrink-0">
                Top {activePct}% ({combosInRange([...activeRange])}c)
              </span>
            </div>
          ) : (
            <HandGrid selected={activeRange} onChange={s => { setActiveRange(s); setResults(null) }} />
          )}
        </div>
      </div>

      <button onClick={run} disabled={computing || heroIdx === villainIdx}
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
              <div className="font-mono text-xs text-slate-500 mb-1">Villain範囲</div>
              <div className="font-mono text-xl font-semibold text-gold-400">Top {activePct}%</div>
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
