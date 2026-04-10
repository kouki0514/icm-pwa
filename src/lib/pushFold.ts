import { calculateICM } from './icm'
import { monteCarloEquity, handKeyToRanks } from './handEquity'

export const ALL_HANDS: string[] = (() => {
  const ranks = 'AKQJT98765432'
  const hands: string[] = []
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      if (i === j) hands.push(ranks[i]+ranks[j])
      else if (j > i) hands.push(ranks[i]+ranks[j]+'s')
      else hands.push(ranks[j]+ranks[i]+'o')
    }
  }
  return hands
})()

export function combosInRange(range: string[]): number {
  return range.reduce((sum, h) => {
    if (h.length === 2) return sum + 6
    if (h.endsWith('s')) return sum + 4
    return sum + 12
  }, 0)
}

const STRENGTH_ORDER: string[] = [
  'AA','KK','QQ','JJ','TT','AKs','AQs','AJs','AKo','99','ATs','AQo',
  'KQs','88','AJo','ATo','KJs','KQo','77','A9s','KTs','A8s','QJs','A7s',
  'KJo','66','A6s','QTs','A5s','A9o','KTo','A4s','A3s','QJo','55','A2s',
  'JTs','A8o','K9s','QTo','A7o','44','K8s','A6o','JTo','Q9s','K9o','A5o',
  'K7s','33','A4o','T9s','J9s','Q8s','K6s','A3o','22','K5s','Q9o','A2o',
  'T8s','J8s','K4s','Q7s','J9o','T9o','K3s','98s','K8o','Q6s','T7s','K2s',
  'J7s','Q5s','T8o','97s','J8o','Q4s','K7o','98o','Q3s','87s','T7o','J6s',
  'Q2s','96s','K6o','J5s','97o','86s','T6s','Q8o','87o','J4s','K5o','76s',
  '95s','J3s','96o','85s','T5s','J2s','86o','K4o','Q7o','75s','T4s','76o',
  '94s','65s','K3o','85o','T3s','J6o','84s','Q6o','95o','74s','T2s','K2o',
  '64s','J5o','75o','93s','54s','83s','Q5o','65o','J4o','84o','73s','94o',
  'Q4o','63s','J3o','74o','92s','53s','Q3o','82s','64o','J2o','73o','43s',
  'Q2o','63o','53o','92o','T6o','54o','72s','83o','43o','82o','T5o','62s',
  'T4o','52s','72o','42s','T3o','62o','52o','T2o','42o','32s','32o'
]

export function topXPercent(x: number): string[] {
  const total = 1326
  const target = Math.round((x / 100) * total)
  let combos = 0
  const result: string[] = []
  for (const h of STRENGTH_ORDER) {
    if (combos >= target) break
    result.push(h)
    if (h.length === 2) combos += 6
    else if (h.endsWith('s')) combos += 4
    else combos += 12
  }
  return result
}

export interface PushCallResult {
  hand: string
  pushEV: number   // 正規化済み: 総賞金に対する差分比率
  callEV: number
  shouldPush: boolean
  shouldCall: boolean
  equity: number
}

export interface PotInfo {
  sb: number
  bb: number
  ante: number
  numPlayers: number
  heroPosition: 'sb' | 'bb' | 'other'
}

// Push EV: 複数Villain対応
// villainIndices: Pushに対してコール判断するVillainのインデックス（順番通りに処理）
// villainRanges: 各VillainのコールレンジのMap (index -> range)
export async function calcPushEV(
  heroIdx: number,
  villainIndices: number[],
  stacks: number[],
  prizes: number[],
  villainRanges: Map<number, string[]>,
  potInfo: PotInfo,
  onProgress?: (pct: number) => void
): Promise<PushCallResult[]> {
  const results: PushCallResult[] = []
  const validPrizes = [...prizes].sort((a, b) => b - a)
  const totalPrize = validPrizes.reduce((a, b) => a + b, 0)
  if (totalPrize === 0) return []

  const icmBase = calculateICM(stacks, validPrizes)
  const baseEquity = icmBase[heroIdx]

  const heroStack = stacks[heroIdx]

  // 全員フォールド時にheroが獲得するチップ
  // SBポジション: すでにSBを出しているのでbb + ante * numPlayers を獲得（自分のSBも含めた全ポットを取るが出した分は戻ってくる形）
  // 実質獲得 = ポット全体 - heroが出した分 = (sb + bb + ante*N) - sb = bb + ante*N
  // BBポジション: bb + ante*N をポットから取るが自分のbbを出しているので実質獲得 = sb + ante*N
  // その他: sb + bb + ante*N を全獲得
  const { sb, bb, ante, numPlayers, heroPosition } = potInfo
  const totalPot = sb + bb + ante * numPlayers
  const foldGain = heroPosition === 'sb'
    ? bb + ante * numPlayers          // SBはsb分を既に出している
    : heroPosition === 'bb'
      ? sb + ante * numPlayers        // BBはbb分を既に出している
      : totalPot                      // その他は全ポット獲得

  // ---- 共通ヘルパー: ICMエクイティ取得 ----
  const getHeroICM = (newStacks: number[]): number => {
    const filtered = newStacks.map((s, i) => ({ s, i })).filter(x => x.s > 0)
    const arr = filtered.map(x => x.s)
    const prz = validPrizes.slice(0, arr.length)
    const eq2 = calculateICM(arr, prz)
    const idx = filtered.findIndex(x => x.i === heroIdx)
    return idx >= 0 ? eq2[idx] : 0
  }

  for (let hi = 0; hi < ALL_HANDS.length; hi++) {
    const h = ALL_HANDS[hi]
    if (onProgress) onProgress(Math.round((hi / ALL_HANDS.length) * 100))

    const [r1, r2] = handKeyToRanks(h)
    const suited = h.endsWith('s')
    const s1 = 0, s2 = suited ? 0 : 1

    // ---- Push EV (複数Villain) ----
    // 各Villainの callFreq と equity を事前計算
    const villainData = villainIndices.map(vIdx => {
      const range = villainRanges.get(vIdx) ?? []
      const callFreq = Math.min(combosInRange(range) / 1326, 1)
      const eq = range.length > 0
        ? monteCarloEquity(r1, r2, s1, s2, range, [], 400)
        : 0.5
      return { vIdx, callFreq, eq, range }
    })

    // 全員フォールドEV: heroStack + foldGain（ポットを獲得）
    const foldStacksPush = [...stacks]
    foldStacksPush[heroIdx] = heroStack + foldGain
    // フォールドしたVillainのスタックは変化なし（アンティは既にポットへ）
    const evAllFold = getHeroICM(foldStacksPush)

    // Push EV = 全員フォールド確率 * evAllFold
    //         + Σ(各Villainがコールし他は全員フォールド) * (そのVillainとの1対1EV)
    // 簡略化: 独立コール判断（各自独立）→ 誰かがコールするシナリオを列挙
    // 全員フォールド確率
    const allFoldProb = villainData.reduce((p, { callFreq }) => p * (1 - callFreq), 1)

    let evPush = allFoldProb * evAllFold

    // 各Villainがコールする場合（他は全員フォールド、独立仮定）
    for (const { vIdx, callFreq, eq } of villainData) {
      const otherFoldProb = villainData
        .filter(v => v.vIdx !== vIdx)
        .reduce((p, v) => p * (1 - v.callFreq), 1)
      const thisCallProb = callFreq * otherFoldProb

      const vStack = stacks[vIdx]
      const effectiveStack = Math.min(heroStack, vStack)

      // オールイン時のポット: effective * 2 + 残りのブラインド・アンティ
      // ブラインド・アンティはすでにスタックから差し引かれてポットに入っている想定
      const sidePot = totalPot  // sb + bb + ante * numPlayers

      // caller wins: heroがeffectiveStack分とサイドポットを獲得
      const winStacksPush = [...stacks]
      winStacksPush[heroIdx] = heroStack + effectiveStack + sidePot
      winStacksPush[vIdx] = Math.max(0, vStack - effectiveStack)
      const evWinPush = getHeroICM(winStacksPush)

      // caller loses: villainがeffectiveStack分とサイドポットを獲得
      const loseStacksPush = [...stacks]
      loseStacksPush[heroIdx] = Math.max(0, heroStack - effectiveStack)
      loseStacksPush[vIdx] = vStack + effectiveStack + sidePot
      const evLosePush = getHeroICM(loseStacksPush)

      evPush += thisCallProb * (eq * evWinPush + (1 - eq) * evLosePush)
    }

    // 複数同時コールは無視（独立仮定の残余確率はここでは省略）

    const pushEV = (evPush - baseEquity) / totalPrize

    // ---- Call EV (1対1: villainIndicesの先頭1人) ----
    // Call分析用は呼び出し元から別途1人のvillainIdxを渡す想定だが
    // ここでは互換のためvillainIndices[0]を使用
    const callVIdx = villainIndices[0]
    const callRange = villainRanges.get(callVIdx) ?? []
    const callEqHero = callRange.length > 0
      ? monteCarloEquity(r1, r2, s1, s2, callRange, [], 400)
      : 0.5

    const callVStack = stacks[callVIdx]
    const effectiveStackCall = Math.min(heroStack, callVStack)
    const sidePotCall = totalPot

    const winStacksCall = [...stacks]
    winStacksCall[heroIdx] = heroStack + effectiveStackCall + sidePotCall
    winStacksCall[callVIdx] = Math.max(0, callVStack - effectiveStackCall)
    const evWinCall = getHeroICM(winStacksCall)

    const loseStacksCall = [...stacks]
    loseStacksCall[heroIdx] = Math.max(0, heroStack - effectiveStackCall)
    loseStacksCall[callVIdx] = callVStack + effectiveStackCall + sidePotCall
    const evLoseCall = getHeroICM(loseStacksCall)

    const evCall = callEqHero * evWinCall + (1 - callEqHero) * evLoseCall
    const callEV = (evCall - baseEquity) / totalPrize

    results.push({
      hand: h,
      pushEV,
      callEV,
      shouldPush: pushEV > 0,
      shouldCall: callEV > 0,
      equity: callEqHero,
    })
  }

  return results
}
