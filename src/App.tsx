import { useState, useCallback } from 'react'
import { calculateICM } from './lib/icm'

interface Player { id: number; name: string; stack: number }
interface Result { player: Player; equity: number; chipPct: number; rank: number }

let nextId = 6
const DEFAULT_PLAYERS: Player[] = [
  { id: 1, name: 'Hero', stack: 35000 },
  { id: 2, name: 'Villain 1', stack: 28000 },
  { id: 3, name: 'Villain 2', stack: 22000 },
  { id: 4, name: 'Villain 3', stack: 15000 },
  { id: 5, name: 'Villain 4', stack: 10000 },
]
const DEFAULT_PRIZES = [500000, 300000, 150000, 50000]

export default function App() {
  const [players, setPlayers] = useState<Player[]>(DEFAULT_PLAYERS)
  const [prizes, setPrizes] = useState<number[]>(DEFAULT_PRIZES)
  const [results, setResults] = useState<Result[] | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'calc' | 'bubble'>('calc')
  const [heroIdx, setHeroIdx] = useState(0)
  const [villainIdx, setVillainIdx] = useState(1)
  const [bubbleResult, setBubbleResult] = useState<{ bf: number; gain: number; loss: number } | null>(null)

  const totalChips = players.reduce((a, b) => a + b.stack, 0)
  const totalPrize = prizes.reduce((a, b) => a + b, 0)

  const addPlayer = () => setPlayers(p => [...p, { id: nextId++, name: `Player ${nextId - 1}`, stack: 10000 }])
  const removePlayer = (id: number) => setPlayers(p => p.filter(x => x.id !== id))
  const updatePlayer = (id: number, field: 'name' | 'stack', value: string | number) =>
    setPlayers(p => p.map(x => x.id === id ? { ...x, [field]: value } : x))
  const addPrize = () => setPrizes(p => [...p, 0])
  const removePrize = (i: number) => setPrizes(p => p.filter((_, j) => j !== i))
  const updatePrize = (i: number, v: number) => setPrizes(p => p.map((x, j) => j === i ? v : x))

  const calculate = useCallback(() => {
    setError('')
    if (players.length < 2) { setError('プレイヤーは2人以上必要です'); return }
    if (players.some(p => p.stack <= 0)) { setError('スタックは全員0より大きくしてください'); return }
    const validPrizes = prizes.filter(p => p > 0).sort((a, b) => b - a)
    if (validPrizes.length === 0) { setError('賞金を1つ以上設定してください'); return }
    const stacks = players.map(p => p.stack)
    const equity = calculateICM(stacks, validPrizes)
    const total = stacks.reduce((a, b) => a + b, 0)
    const res: Result[] = players.map((p, i) => ({ player: p, equity: equity[i], chipPct: (p.stack / total) * 100, rank: 0 }))
    res.sort((a, b) => b.equity - a.equity)
    res.forEach((r, i) => { r.rank = i + 1 })
    setResults(res)
  }, [players, prizes])

  const calcBubble = useCallback(() => {
    if (heroIdx === villainIdx) { setBubbleResult(null); return }
    const stacks = players.map(p => p.stack)
    const validPrizes = prizes.filter(p => p > 0).sort((a, b) => b - a)
    if (validPrizes.length === 0) return
    const baseEquity = calculateICM(stacks, validPrizes)
    const heroStack = stacks[heroIdx]
    const villainStack = stacks[villainIdx]
    const winStacks = [...stacks]
    winStacks[heroIdx] = heroStack + villainStack
    winStacks.splice(villainIdx, 1)
    const equityWin = calculateICM(winStacks, validPrizes.slice(0, winStacks.length))
    const winAdjIdx = heroIdx < villainIdx ? heroIdx : heroIdx - 1
    const heroWin = equityWin[winAdjIdx] ?? 0
    const loseStacks = [...stacks]
    loseStacks[villainIdx] = heroStack + villainStack
    loseStacks.splice(heroIdx, 1)
    const gain = heroWin - baseEquity[heroIdx]
    const loss = baseEquity[heroIdx]
    const bf = gain > 0 ? loss / gain : Infinity
    setBubbleResult({ bf, gain, loss })
  }, [heroIdx, villainIdx, players, prizes])

  const maxEquity = results ? Math.max(...results.map(r => r.equity)) : 1

  return (
    <div className="min-h-full bg-surface-900 text-slate-200">
      <header className="bg-surface-800 border-b border-surface-600 px-4 py-3 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-gold-400 flex items-center justify-center">
          <span className="text-surface-900 font-mono font-bold text-xs">ICM</span>
        </div>
        <h1 className="font-mono font-semibold text-slate-100 text-base">ICM Calculator</h1>
        <div className="ml-auto flex items-center gap-2 text-xs font-mono text-slate-500">
          <span>{players.length}人</span><span>·</span><span>¥{totalPrize.toLocaleString()}</span>
        </div>
      </header>

      <div className="flex border-b border-surface-600 bg-surface-800">
        {(['calc', 'bubble'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 font-mono text-sm border-b-2 transition-colors ${tab === t ? 'border-gold-400 text-gold-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
            {t === 'calc' ? 'ICM計算' : 'バブルファクター'}
          </button>
        ))}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {tab === 'calc' && (
          <>
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-mono text-xs text-slate-500 uppercase tracking-wider">賞金構造</h2>
                <span className="font-mono text-xs text-gold-400">合計 ¥{totalPrize.toLocaleString()}</span>
              </div>
              <div className="space-y-2">
                {prizes.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-500 w-8 text-right">{i + 1}位</span>
                    <span className="text-slate-500 text-sm">¥</span>
                    <input type="number" className="input-base" value={p} min={0} step={1000} onChange={e => updatePrize(i, +e.target.value)} />
                    {prizes.length > 1 && <button onClick={() => removePrize(i)} className="text-slate-600 hover:text-slate-400 text-lg px-1">×</button>}
                  </div>
                ))}
              </div>
              <button onClick={addPrize} className="mt-3 w-full border border-dashed border-surface-600 text-slate-600 hover:text-slate-400 font-mono text-xs py-1.5 rounded-lg transition-colors">+ 賞金を追加</button>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-mono text-xs text-slate-500 uppercase tracking-wider">プレイヤー</h2>
                <span className="font-mono text-xs text-gold-400">合計 {totalChips.toLocaleString()} chips</span>
              </div>
              <div className="space-y-2">
                {players.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <input type="text" className="input-base" style={{width:'110px',flexShrink:0}} value={p.name} onChange={e => updatePlayer(p.id, 'name', e.target.value)} placeholder="名前" />
                    <input type="number" className="input-base" value={p.stack} min={0} step={500} onChange={e => updatePlayer(p.id, 'stack', +e.target.value)} />
                    <span className="font-mono text-xs text-slate-600 w-12 text-right flex-shrink-0">{totalChips > 0 ? ((p.stack / totalChips) * 100).toFixed(1) : '0.0'}%</span>
                    {players.length > 2 && <button onClick={() => removePlayer(p.id)} className="text-slate-600 hover:text-slate-400 text-lg px-1">×</button>}
                  </div>
                ))}
              </div>
              <button onClick={addPlayer} className="mt-3 w-full border border-dashed border-surface-600 text-slate-600 hover:text-slate-400 font-mono text-xs py-1.5 rounded-lg transition-colors">+ プレイヤーを追加</button>
            </div>

            {error && <p className="font-mono text-xs text-red-400 px-1">{error}</p>}
            <button onClick={calculate} className="btn-primary w-full">ICMエクイティを計算</button>

            {results && (
              <div className="card space-y-1">
                <h2 className="font-mono text-xs text-slate-500 uppercase tracking-wider mb-3">結果</h2>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[{label:'参加人数',value:`${players.length}人`},{label:'賞金総額',value:`¥${totalPrize.toLocaleString()}`},{label:'入賞ライン',value:`${prizes.filter(p=>p>0).length}位まで`}].map(m => (
                    <div key={m.label} className="bg-surface-800 rounded-lg p-3">
                      <div className="font-mono text-xs text-slate-500 mb-1">{m.label}</div>
                      <div className="font-mono text-sm font-semibold text-slate-100">{m.value}</div>
                    </div>
                  ))}
                </div>
                {results.map(r => (
                  <div key={r.player.id} className="py-2 border-b border-surface-600 last:border-0">
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className="font-mono text-xs text-slate-600 w-4">{r.rank}</span>
                      <span className="font-mono text-sm text-slate-100 flex-1">{r.player.name}</span>
                      <span className="font-mono text-xs text-slate-500">{r.chipPct.toFixed(1)}%</span>
                      <span className="font-mono text-sm font-semibold text-gold-400 w-28 text-right">¥{Math.round(r.equity).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-4" />
                      <div className="flex-1 h-1 bg-surface-600 rounded-full overflow-hidden">
                        <div className="h-full bg-gold-400 rounded-full transition-all duration-500" style={{width:`${(r.equity/maxEquity)*100}%`}} />
                      </div>
                      <span className="font-mono text-xs text-slate-600 w-28 text-right">{((r.equity/totalPrize)*100).toFixed(1)}% of prize</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'bubble' && (
          <>
            <div className="card">
              <h2 className="font-mono text-xs text-slate-500 uppercase tracking-wider mb-3">バブルファクター計算</h2>
              <p className="font-mono text-xs text-slate-500 mb-4">オールインコール時の損失/利得のICM比率。BF {'>'} 1 ほどコールに慎重が必要。</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="font-mono text-xs text-slate-500 w-20">Hero</label>
                  <select className="input-base" value={heroIdx} onChange={e => setHeroIdx(+e.target.value)}>
                    {players.map((p, i) => <option key={p.id} value={i}>{p.name} ({p.stack.toLocaleString()})</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <label className="font-mono text-xs text-slate-500 w-20">Villain</label>
                  <select className="input-base" value={villainIdx} onChange={e => setVillainIdx(+e.target.value)}>
                    {players.map((p, i) => <option key={p.id} value={i}>{p.name} ({p.stack.toLocaleString()})</option>)}
                  </select>
                </div>
              </div>
              <button onClick={calcBubble} className="btn-primary w-full mt-4">計算する</button>
            </div>
            {bubbleResult && (
              <div className="card">
                <h2 className="font-mono text-xs text-slate-500 uppercase tracking-wider mb-3">結果</h2>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-surface-800 rounded-lg p-3">
                    <div className="font-mono text-xs text-slate-500 mb-1">バブルファクター</div>
                    <div className={`font-mono text-xl font-semibold ${bubbleResult.bf > 2 ? 'text-red-400' : bubbleResult.bf > 1.3 ? 'text-amber-400' : 'text-green-400'}`}>{bubbleResult.bf.toFixed(2)}</div>
                  </div>
                  <div className="bg-surface-800 rounded-lg p-3">
                    <div className="font-mono text-xs text-slate-500 mb-1">勝ち時の利得</div>
                    <div className="font-mono text-sm font-semibold text-green-400">+¥{Math.round(bubbleResult.gain).toLocaleString()}</div>
                  </div>
                  <div className="bg-surface-800 rounded-lg p-3">
                    <div className="font-mono text-xs text-slate-500 mb-1">負け時の損失</div>
                    <div className="font-mono text-sm font-semibold text-red-400">-¥{Math.round(bubbleResult.loss).toLocaleString()}</div>
                  </div>
                </div>
                <div className="mt-3 p-3 bg-surface-800 rounded-lg">
                  <p className="font-mono text-xs text-slate-400">{bubbleResult.bf > 2 ? '⚠ BF が高い。コールには非常に強いハンドが必要。' : bubbleResult.bf > 1.3 ? '注意: チップEVよりも ICM プレッシャーが大きい。' : '✓ ICM プレッシャーは比較的低い。チップEVを重視できる。'}</p>
                </div>
              </div>
            )}
          </>
        )}
        <div className="text-center"><p className="font-mono text-xs text-slate-600">Malmuth-Harville ICMモデル · 9人以下は厳密計算</p></div>
      </div>
    </div>
  )
}
