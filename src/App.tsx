import { useState, useCallback } from 'react'
import { calculateICM } from './lib/icm'
import { calcPushEV, topXPercent, type PushCallResult, type PotInfo } from './lib/pushFold'
import HandGrid from './components/HandGrid'

// ---- 型定義 ----
interface TablePlayer { id: number; name: string; stack: number; isHero: boolean }
type PositionLabel = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB'

const SEAT_ORDER: PositionLabel[] = ['SB', 'BB', 'BTN', 'CO', 'HJ', 'UTG']
const CALLERS_FROM: Record<PositionLabel, PositionLabel[]> = {
  UTG: ['HJ', 'CO', 'BTN', 'SB', 'BB'],
  HJ:  ['CO', 'BTN', 'SB', 'BB'],
  CO:  ['BTN', 'SB', 'BB'],
  BTN: ['SB', 'BB'],
  SB:  ['BB'],
  BB:  [],
}

function assignPositions(n: number): PositionLabel[] {
  return Array.from({ length: n }, (_, i) => {
    const fromEnd = n - 1 - i
    return SEAT_ORDER[fromEnd] ?? 'UTG'
  })
}

// ---- デフォルト値 ----
let nextId = 4
const DEFAULT_TABLE: TablePlayer[] = [
  { id: 1, name: 'Hero',      stack: 30000, isHero: true  },
  { id: 2, name: 'Villain 1', stack: 25000, isHero: false },
  { id: 3, name: 'Villain 2', stack: 15000, isHero: false },
]
const DEFAULT_PRIZES = [500000, 300000, 150000, 50000]

// ---- コンポーネント ----
export default function App() {
  // 賞金構造
  const [prizes, setPrizes] = useState<number[]>(DEFAULT_PRIZES)
  const [prizesOpen, setPrizesOpen] = useState(false)

  // トーナメント情報
  const [totalPlayers, setTotalPlayers] = useState(30)
  const [avgStack, setAvgStack] = useState(10000)

  // 自テーブル
  const [tablePlayers, setTablePlayers] = useState<TablePlayer[]>(DEFAULT_TABLE)
  const [heroPosition, setHeroPosition] = useState<PositionLabel>('BTN')

  // ブラインド・アンティ
  const [sbAmount, setSbAmount] = useState(100)
  const [bbAmount, setBbAmount] = useState(200)
  const [anteAmount, setAnteAmount] = useState(0)

  // 結果
  const [icmResults, setIcmResults] = useState<{ name: string; stack: number; equity: number; chipPct: number }[] | null>(null)
  const [bfResults, setBfResults] = useState<{ villain: string; bf: number; gain: number; loss: number }[] | null>(null)
  const [pushResults, setPushResults] = useState<PushCallResult[] | null>(null)
  const [computing, setComputing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  // ---- テーブルプレイヤー操作 ----
  const addTablePlayer = () => {
    setTablePlayers(p => [...p, { id: nextId++, name: `Villain ${nextId - 2}`, stack: 10000, isHero: false }])
  }
  const removeTablePlayer = (id: number) => {
    setTablePlayers(p => {
      if (p.length <= 2) return p
      return p.filter(x => x.id !== id)
    })
  }
  const updateTablePlayer = (id: number, field: 'name' | 'stack', value: string | number) => {
    setTablePlayers(p => p.map(x => x.id === id ? { ...x, [field]: value } : x))
  }

  // 賞金操作
  const addPrize = () => setPrizes(p => [...p, 0])
  const removePrize = (i: number) => setPrizes(p => p.filter((_, j) => j !== i))
  const updatePrize = (i: number, v: number) => setPrizes(p => p.map((x, j) => j === i ? v : x))

  // ---- 派生値 ----
  const heroIdx = tablePlayers.findIndex(p => p.isHero)
  const tableCount = tablePlayers.length
  const outsideCount = Math.max(0, totalPlayers - tableCount)
  const positionLabels = assignPositions(tableCount)
  const validPrizes = prizes.filter(p => p > 0).sort((a, b) => b - a)
  const totalPrize = validPrizes.reduce((a, b) => a + b, 0)

  // テーブル外プレイヤーを補完してフルplayersリストを生成
  const buildAllPlayers = useCallback((): { name: string; stack: number }[] => {
    const outside = outsideCount > 0
      ? Array.from({ length: outsideCount }, (_, i) => ({ name: `Out${i + 1}`, stack: avgStack }))
      : []
    return [...tablePlayers.map(p => ({ name: p.name, stack: p.stack })), ...outside]
  }, [tablePlayers, outsideCount, avgStack])

  // ---- 計算 ----
  const calculate = useCallback(async () => {
    setError('')
    if (heroIdx < 0) { setError('Heroが設定されていません'); return }
    if (tablePlayers.some(p => p.stack <= 0)) { setError('スタックは0より大きくしてください'); return }
    if (validPrizes.length === 0) { setError('賞金を1つ以上設定してください'); return }
    if (totalPlayers < tableCount) { setError('総人数はテーブル人数以上にしてください'); return }

    setComputing(true)
    setProgress(0)
    setPushResults(null)
    setIcmResults(null)
    setBfResults(null)

    try {
      const allPlayers = buildAllPlayers()
      const stacks = allPlayers.map(p => p.stack)

      // ---- ICM計算 ----
      const icmEquity = calculateICM(stacks, validPrizes)
      const totalChips = stacks.reduce((a, b) => a + b, 0)
      setIcmResults(
        tablePlayers.map((p, i) => ({
          name: p.name,
          stack: p.stack,
          equity: icmEquity[i],
          chipPct: (p.stack / totalChips) * 100,
        })).sort((a, b) => b.equity - a.equity)
      )

      // ---- バブルファクター計算 ----
      const heroStack = stacks[heroIdx]
      const baseEquity = icmEquity[heroIdx]
      const bfList = tablePlayers
        .map((p, i) => ({ p, i }))
        .filter(({ i }) => i !== heroIdx)
        .map(({ p, i }) => {
          const vStack = stacks[i]
          const winStacks = [...stacks]
          winStacks[heroIdx] = heroStack + vStack
          winStacks[i] = 0
          const winFiltered = winStacks.filter(s => s > 0)
          const winICM = calculateICM(winFiltered, validPrizes.slice(0, winFiltered.length))
          // heroのインデックスを再計算（iがheroより前か後かで変わる）
          const winHeroIdx = heroIdx < i ? heroIdx : heroIdx - 1
          const heroWin = winICM[winHeroIdx] ?? 0
          const gain = heroWin - baseEquity
          const loss = baseEquity
          const bf = gain > 0 ? loss / gain : Infinity
          return { villain: p.name, bf, gain, loss }
        })
      setBfResults(bfList)

      // ---- Push/Fold計算 ----
      const callerPositions = CALLERS_FROM[heroPosition]
      const villainIndices = positionLabels
        .map((pos, i) => ({ pos, i }))
        .filter(({ pos, i }) => callerPositions.includes(pos) && i !== heroIdx)
        .map(({ i }) => i)

      const villainRanges = new Map<number, string[]>()
      for (const vIdx of villainIndices) {
        villainRanges.set(vIdx, topXPercent(30))
      }

      const heroPos: PotInfo['heroPosition'] =
        heroPosition === 'SB' ? 'sb' : heroPosition === 'BB' ? 'bb' : 'other'
      const potInfo: PotInfo = {
        sb: sbAmount, bb: bbAmount, ante: anteAmount,
        numPlayers: tableCount, heroPosition: heroPos,
      }

      const pushTargetIndices = villainIndices.length > 0 ? villainIndices : [tablePlayers.findIndex((_, i) => i !== heroIdx)]
      const res = await calcPushEV(
        heroIdx, pushTargetIndices, stacks, validPrizes, villainRanges, potInfo,
        (pct) => setProgress(pct)
      )
      setPushResults(res)
    } catch (e) {
      setError(String(e))
    } finally {
      setComputing(false)
      setProgress(100)
    }
  }, [tablePlayers, heroIdx, heroPosition, positionLabels, prizes, validPrizes, totalPlayers, tableCount, avgStack, sbAmount, bbAmount, anteAmount, buildAllPlayers])

  // Push/Foldグリッド用colorMap
  const pushColorMap = new Map<string, 'push' | 'call' | 'both' | 'none'>()
  if (pushResults) {
    for (const r of pushResults) {
      pushColorMap.set(r.hand, r.shouldPush ? 'push' : 'none')
    }
  }

  const pushCount = pushResults?.filter(r => r.shouldPush).length ?? 0
  const totalChipsDisplay = tablePlayers.reduce((a, b) => a + b.stack, 0)

  return (
    <div className="min-h-full bg-surface-900 text-slate-200">
      {/* ヘッダー */}
      <header className="bg-surface-800 border-b border-surface-600 px-4 py-3 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-gold-400 flex items-center justify-center">
          <span className="text-surface-900 font-mono font-bold text-xs">ICM</span>
        </div>
        <h1 className="font-mono font-semibold text-slate-100 text-base">ICM Push/Fold Analyzer</h1>
        <div className="ml-auto font-mono text-xs text-slate-500">¥{totalPrize.toLocaleString()}</div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* (1) 賞金構造 — デフォルト折りたたみ */}
        <div className="card">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setPrizesOpen(o => !o)}
          >
            <h2 className="font-mono text-xs text-slate-500 uppercase tracking-wider">賞金構造</h2>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gold-400">¥{totalPrize.toLocaleString()} · {validPrizes.length}位まで</span>
              <span className="font-mono text-xs text-slate-500">{prizesOpen ? '▲' : '▼'}</span>
            </div>
          </button>
          {prizesOpen && (
            <div className="mt-3 space-y-2">
              {prizes.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-500 w-8 text-right">{i + 1}位</span>
                  <span className="text-slate-500 text-sm">¥</span>
                  <input type="number" className="input-base" value={p} min={0} step={1000}
                    onChange={e => updatePrize(i, +e.target.value)} />
                  {prizes.length > 1 && (
                    <button onClick={() => removePrize(i)} className="text-slate-600 hover:text-slate-400 text-lg px-1">×</button>
                  )}
                </div>
              ))}
              <button onClick={addPrize}
                className="w-full border border-dashed border-surface-600 text-slate-600 hover:text-slate-400 font-mono text-xs py-1.5 rounded-lg transition-colors">
                + 賞金を追加
              </button>
            </div>
          )}
        </div>

        {/* (2) トーナメント情報 */}
        <div className="card">
          <h2 className="font-mono text-xs text-slate-500 uppercase tracking-wider mb-3">トーナメント情報</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-xs text-slate-500 block mb-1">残り総人数</label>
              <input type="number" className="input-base w-full" min={2} step={1} value={totalPlayers}
                onChange={e => setTotalPlayers(Math.max(2, +e.target.value))} />
            </div>
            <div>
              <label className="font-mono text-xs text-slate-500 block mb-1">平均チップ数</label>
              <input type="number" className="input-base w-full" min={1} step={500} value={avgStack}
                onChange={e => setAvgStack(Math.max(1, +e.target.value))} />
            </div>
          </div>
          <div className="font-mono text-xs text-slate-600 mt-2">
            テーブル外 {outsideCount} 人 × {avgStack.toLocaleString()} chips を ICM 計算に補完
          </div>
        </div>

        {/* (3) 自テーブル */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-mono text-xs text-slate-500 uppercase tracking-wider">自テーブル</h2>
            <span className="font-mono text-xs text-gold-400">{totalChipsDisplay.toLocaleString()} chips</span>
          </div>

          {/* ポジション選択 */}
          <div className="flex items-center gap-3 mb-3">
            <label className="font-mono text-xs text-slate-500 w-24 flex-shrink-0">Heroポジション</label>
            <div className="flex gap-1 flex-wrap">
              {(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const).map(pos => (
                <button key={pos} onClick={() => setHeroPosition(pos)}
                  className={`font-mono text-xs px-2 py-1 rounded border transition-colors ${heroPosition === pos ? 'bg-gold-400 text-surface-900 border-gold-400' : 'border-surface-600 text-slate-400 hover:text-slate-200'}`}>
                  {pos}
                </button>
              ))}
            </div>
          </div>

          {/* プレイヤーリスト */}
          <div className="space-y-2 mb-3">
            {tablePlayers.map((p, i) => {
              const pos = positionLabels[i] ?? ''
              const isHeroPos = pos === heroPosition
              return (
                <div key={p.id} className="flex items-center gap-2">
                  <span className={`font-mono text-xs w-8 text-center flex-shrink-0 ${isHeroPos ? 'text-gold-400 font-bold' : 'text-slate-600'}`}>
                    {pos}
                  </span>
                  <input type="text" className="input-base" style={{ width: '100px', flexShrink: 0 }}
                    value={p.name} onChange={e => updateTablePlayer(p.id, 'name', e.target.value)} />
                  <input type="number" className="input-base" min={0} step={500}
                    value={p.stack} onChange={e => updateTablePlayer(p.id, 'stack', +e.target.value)} />
                  <span className="font-mono text-xs text-slate-600 w-10 text-right flex-shrink-0">
                    {totalChipsDisplay > 0 ? ((p.stack / totalChipsDisplay) * 100).toFixed(0) : 0}%
                  </span>
                  {tablePlayers.length > 2 && (
                    <button onClick={() => removeTablePlayer(p.id)}
                      className="text-slate-600 hover:text-slate-400 text-lg px-1 flex-shrink-0">×</button>
                  )}
                </div>
              )
            })}
          </div>
          <button onClick={addTablePlayer}
            className="w-full border border-dashed border-surface-600 text-slate-600 hover:text-slate-400 font-mono text-xs py-1.5 rounded-lg transition-colors mb-4">
            + プレイヤーを追加
          </button>

          {/* SB / BB / Ante */}
          <div>
            <div className="font-mono text-xs text-slate-500 mb-2">ブラインド・アンティ</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="font-mono text-xs text-slate-500 block mb-1">SB</label>
                <input type="number" min={0} value={sbAmount}
                  onChange={e => setSbAmount(Math.max(0, +e.target.value))}
                  className="input-base w-full" />
              </div>
              <div>
                <label className="font-mono text-xs text-slate-500 block mb-1">BB</label>
                <input type="number" min={0} value={bbAmount}
                  onChange={e => setBbAmount(Math.max(0, +e.target.value))}
                  className="input-base w-full" />
              </div>
              <div>
                <label className="font-mono text-xs text-slate-500 block mb-1">Ante（/人）</label>
                <input type="number" min={0} value={anteAmount}
                  onChange={e => setAnteAmount(Math.max(0, +e.target.value))}
                  className="input-base w-full" />
              </div>
            </div>
          </div>
        </div>

        {/* (4) 計算ボタン */}
        {error && <p className="font-mono text-xs text-red-400 px-1">{error}</p>}
        <button onClick={calculate} disabled={computing}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-wait">
          {computing ? `計算中... ${progress}%` : '計算する'}
        </button>
        {computing && (
          <div className="h-1 bg-surface-700 rounded-full overflow-hidden">
            <div className="h-full bg-gold-400 transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
        )}

        {/* (5) 結果セクション */}
        {icmResults && (
          <>
            {/* ICMエクイティ一覧 */}
            <div className="card">
              <h2 className="font-mono text-xs text-slate-500 uppercase tracking-wider mb-3">ICMエクイティ</h2>
              <div className="space-y-1">
                {icmResults.map((r, rank) => (
                  <div key={r.name} className="py-2 border-b border-surface-600 last:border-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-xs text-slate-600 w-4">{rank + 1}</span>
                      <span className="font-mono text-sm text-slate-100 flex-1">{r.name}</span>
                      <span className="font-mono text-xs text-slate-500">{r.chipPct.toFixed(1)}%</span>
                      <span className="font-mono text-sm font-semibold text-gold-400 w-28 text-right">
                        ¥{Math.round(r.equity).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-4" />
                      <div className="flex-1 h-1 bg-surface-600 rounded-full overflow-hidden">
                        <div className="h-full bg-gold-400 rounded-full"
                          style={{ width: `${(r.equity / (icmResults[0]?.equity || 1)) * 100}%` }} />
                      </div>
                      <span className="font-mono text-xs text-slate-600 w-28 text-right">
                        {((r.equity / totalPrize) * 100).toFixed(1)}% of prize
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* バブルファクター表 */}
            {bfResults && bfResults.length > 0 && (
              <div className="card">
                <h2 className="font-mono text-xs text-slate-500 uppercase tracking-wider mb-3">バブルファクター（Hero vs 各Villain）</h2>
                <div className="space-y-2">
                  {bfResults.map(r => (
                    <div key={r.villain} className="flex items-center gap-3 py-1 border-b border-surface-600 last:border-0">
                      <span className="font-mono text-sm text-slate-100 flex-1">{r.villain}</span>
                      <span className="font-mono text-xs text-green-400 w-24 text-right">
                        +¥{Math.round(r.gain).toLocaleString()}
                      </span>
                      <span className="font-mono text-xs text-red-400 w-24 text-right">
                        -¥{Math.round(r.loss).toLocaleString()}
                      </span>
                      <span className={`font-mono text-sm font-semibold w-14 text-right ${r.bf > 2 ? 'text-red-400' : r.bf > 1.3 ? 'text-amber-400' : 'text-green-400'}`}>
                        {isFinite(r.bf) ? r.bf.toFixed(2) : '∞'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="font-mono text-xs text-slate-600 mt-2">BF = ICM損失 / ICM利得。高いほどコール慎重が必要。</p>
              </div>
            )}

            {/* Push/Foldハンドグリッド */}
            {pushResults && (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-mono text-xs text-slate-500 uppercase tracking-wider">Push/Fold — {heroPosition}</h2>
                  <span className="font-mono text-xs text-green-400">{pushCount} / 169 hands</span>
                </div>
                <div className="font-mono text-xs text-slate-500 mb-2">
                  緑 = Push有利　グレー = フォールド推奨
                  <span className="ml-2 text-slate-600">
                    (Villain Top 30% コールレンジ想定)
                  </span>
                </div>
                <HandGrid selected={new Set()} onChange={() => {}} colorMap={pushColorMap} readOnly />

                {/* EV上位ハンド */}
                <div className="mt-4">
                  <div className="font-mono text-xs text-slate-500 mb-2">Push EV上位ハンド</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {[...pushResults]
                      .filter(r => r.shouldPush)
                      .sort((a, b) => b.pushEV - a.pushEV)
                      .slice(0, 15)
                      .map(r => (
                        <div key={r.hand} className="flex items-center gap-3 py-0.5 border-b border-surface-600 last:border-0">
                          <span className="font-mono text-xs text-slate-100 w-10">{r.hand}</span>
                          <span className="font-mono text-xs text-slate-500 w-16">eq {(r.equity * 100).toFixed(1)}%</span>
                          <div className="flex-1 h-1 bg-surface-600 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full"
                              style={{ width: `${Math.min(100, Math.abs(r.pushEV) * 5000)}%` }} />
                          </div>
                          <span className="font-mono text-xs w-20 text-right text-green-400">
                            +{(r.pushEV * 100).toFixed(3)}%
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="text-center">
          <p className="font-mono text-xs text-slate-600">Malmuth-Harville ICM · Monte Carlo equity</p>
        </div>
      </div>
    </div>
  )
}
