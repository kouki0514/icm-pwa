import { useState, useCallback } from 'react'
import HandGrid from './HandGrid'
import { topXPercent, calcPushEV, combosInRange, type PushCallResult } from '../lib/pushFold'

interface Player { id: number; name: string; stack: number }

interface Props {
  players: Player[]
  prizes: number[]
}

export default function PushCallTab({ players, prizes }: Props) {
  const [heroIdx, setHeroIdx] = useState(0)
  const [villainCallRange, setVillainCallRange] = useState<Set<string>>(new Set(topXPercent(30)))
  const [villainPushRange, setVillainPushRange] = useState<Set<string>>(new Set(topXPercent(40)))
  const [rangeInputMode, setRangeInputMode] = useState<'grid' | 'pct'>('pct')
  const [callPct, setCallPct] = useState(30)
  const [pushPct, setPushPct] = useState(40)
  const [mode, setMode] = useState<'push' | 'call'>('push')
  const [results, setResults] = useState<PushCallResult[] | null>(null)
  const [computing, setComputing] = useState(false)
  const [progress, setProgress] = useState(0)

  const totalChips = players.reduce((a,b)=>a+b.stack,0)
  const bb = Math.round(totalChips / 100) || 100
  const sb = Math.round(bb / 2)

  const run = useCallback(async () => {
    if (players.length < 2) return
    setComputing(true)
    setProgress(0)
    const stacks = players.map(p=>p.stack)
    const validPrizes = prizes.filter(p=>p>0).sort((a,b)=>b-a)
    const range = mode === 'push' ? [...villainCallRange] : [...villainPushRange]
    try {
      const res = await calcPushEV(heroIdx, stacks, validPrizes, 'all', range, {sb,bb}, (pct) => setProgress(pct))
      setResults(res)
    } finally {
      setComputing(false)
      setProgress(100)
    }
  }, [heroIdx, villainCallRange, villainPushRange, mode, players, prizes, sb, bb])

  const colorMap = new Map<string, 'push'|'call'|'both'|'none'>()
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

  const pushCount = results?.filter(r=>r.shouldPush).length ?? 0
  const callCount = results?.filter(r=>r.shouldCall).length ?? 0

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex gap-2 mb-4">
          {(['push','call'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setResults(null) }}
              className={`flex-1 font-mono text-sm py-2 rounded-lg border transition-colors ${mode===m ? 'bg-gold-400 text-surface-900 border-gold-400' : 'border-surface-600 text-slate-400 hover:text-slate-200'}`}>
              {m === 'push' ? 'Push分析' : 'Call分析'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-3">
          <label className="font-mono text-xs text-slate-500 w-20 flex-shrink-0">Hero</label>
          <select className="input-base" value={heroIdx} onChange={e=>setHeroIdx(+e.target.value)}>
            {players.map((p,i)=>(
              <option key={p.id} value={i}>{p.name} — {p.stack.toLocaleString()} ({((p.stack/totalChips)*100).toFixed(1)}%)</option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-slate-500">
              {mode==='push' ? 'Villain コールレンジ' : 'Villain プッシュレンジ'}
            </span>
            <div className="flex gap-1">
              {(['pct','grid'] as const).map(m=>(
                <button key={m} onClick={()=>setRangeInputMode(m)}
                  className={`font-mono text-xs px-2 py-0.5 rounded border transition-colors ${rangeInputMode===m?'border-gold-400 text-gold-400':'border-surface-600 text-slate-500'}`}>
                  {m==='pct'?'%指定':'グリッド'}
                </button>
              ))}
            </div>
          </div>

          {rangeInputMode === 'pct' ? (
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={100} step={1} value={activePct}
                onChange={e=>{
                  const v=+e.target.value
                  setActivePct(v)
                  setActiveRange(new Set(topXPercent(v)))
                  setResults(null)
                }} className="flex-1" />
              <span className="font-mono text-sm text-gold-400 w-36 text-right flex-shrink-0">
                Top {activePct}% ({combosInRange([...activeRange])}c)
              </span>
            </div>
          ) : (
            <HandGrid selected={activeRange} onChange={s=>{ setActiveRange(s); setResults(null) }} />
          )}
        </div>
      </div>

      <button onClick={run} disabled={computing}
        className="btn-primary w-full disabled:opacity-50 disabled:cursor-wait">
        {computing ? `計算中... ${progress}%` : `全169ハンドを計算`}
      </button>

      {computing && (
        <div className="h-1 bg-surface-700 rounded-full overflow-hidden">
          <div className="h-full bg-gold-400 transition-all duration-200" style={{width:`${progress}%`}} />
        </div>
      )}

      {results && (
        <div className="card space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-surface-800 rounded-lg p-3">
              <div className="font-mono text-xs text-slate-500 mb-1">{mode==='push'?'Push推奨':'Call推奨'}</div>
              <div className="font-mono text-xl font-semibold text-green-400">{mode==='push'?pushCount:callCount} / 169</div>
            </div>
            <div className="bg-surface-800 rounded-lg p-3">
              <div className="font-mono text-xs text-slate-500 mb-1">vs Villain範囲</div>
              <div className="font-mono text-xl font-semibold text-gold-400">Top {activePct}%</div>
            </div>
          </div>

          <div>
            <div className="font-mono text-xs text-slate-500 mb-2">
              {mode==='push'?'緑 = Push有利':'黄 = Call有利'}　グレー = フォールド推奨
            </div>
            <HandGrid selected={new Set()} onChange={()=>{}} colorMap={colorMap} readOnly />
          </div>

          <div>
            <div className="font-mono text-xs text-slate-500 mb-2">EV上位ハンド</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {[...results]
                .filter(r=>mode==='push'?r.shouldPush:r.shouldCall)
                .sort((a,b)=>(mode==='push'?b.pushEV-a.pushEV:b.callEV-a.callEV))
                .slice(0,20)
                .map(r=>(
                  <div key={r.hand} className="flex items-center gap-3 py-1 border-b border-surface-600 last:border-0">
                    <span className="font-mono text-xs text-slate-100 w-10">{r.hand}</span>
                    <span className="font-mono text-xs text-slate-500 w-16">eq {(r.equity*100).toFixed(1)}%</span>
                    <div className="flex-1 h-1 bg-surface-600 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full"
                        style={{width:`${Math.min(100,Math.abs(mode==='push'?r.pushEV:r.callEV)*5000)}%`}} />
                    </div>
                    <span className={`font-mono text-xs w-20 text-right ${(mode==='push'?r.pushEV:r.callEV)>0?'text-green-400':'text-red-400'}`}>
                      {(mode==='push'?r.pushEV:r.callEV)>0?'+':''}{((mode==='push'?r.pushEV:r.callEV)*100).toFixed(3)}%
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
