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
  pushEV: number
  callEV: number
  shouldPush: boolean
  shouldCall: boolean
  equity: number
}

export async function calcPushEV(
  heroIdx: number,
  villainIdx: number,
  stacks: number[],
  prizes: number[],
  villainRange: string[],
  onProgress?: (pct: number) => void
): Promise<PushCallResult[]> {
  const results: PushCallResult[] = []
  const validPrizes = [...prizes].sort((a, b) => b - a)
  const baseEquity = calculateICM(stacks, validPrizes)[heroIdx]
  const heroStack = stacks[heroIdx]
  const villainStack = stacks[villainIdx]

  // effective stack = min(hero, villain) — villain may not cover hero
  const effectiveStack = Math.min(heroStack, villainStack)

  for (let hi = 0; hi < ALL_HANDS.length; hi++) {
    const h = ALL_HANDS[hi]
    if (onProgress) onProgress(Math.round((hi / ALL_HANDS.length) * 100))

    const [r1, r2] = handKeyToRanks(h)
    const suited = h.endsWith('s')
    const s1 = 0, s2 = suited ? 0 : 1

    const eq = villainRange.length > 0
      ? monteCarloEquity(r1, r2, s1, s2, villainRange, [], 400)
      : 0.5

    // --- Push EV ---
    // villain folds: hero wins BB (approximated as 1BB = effectiveStack/50)
    const bb = Math.round((heroStack + villainStack) / 100) || 100
    const foldStacksPush = [...stacks]
    foldStacksPush[heroIdx] = heroStack + bb
    foldStacksPush[villainIdx] = villainStack - bb
    const evFoldPush = calculateICM(foldStacksPush, validPrizes)[heroIdx]

    // villain calls and hero wins
    const winStacksPush = [...stacks]
    winStacksPush[heroIdx] = heroStack + effectiveStack
    winStacksPush[villainIdx] = villainStack - effectiveStack
    // remove busted players
    const winStacksFiltered = winStacksPush.map((s, i) => ({ s, i })).filter(x => x.s > 0)
    const winStacksArr = winStacksFiltered.map(x => x.s)
    const winPrizes = validPrizes.slice(0, winStacksArr.length)
    const winEquities = calculateICM(winStacksArr, winPrizes)
    const heroWinIdxPush = winStacksFiltered.findIndex(x => x.i === heroIdx)
    const evWinPush = heroWinIdxPush >= 0 ? winEquities[heroWinIdxPush] : 0

    // villain calls and hero loses
    const loseStacksPush = [...stacks]
    loseStacksPush[villainIdx] = villainStack + effectiveStack
    loseStacksPush[heroIdx] = heroStack - effectiveStack
    const loseStacksFiltered = loseStacksPush.map((s, i) => ({ s, i })).filter(x => x.s > 0)
    const loseStacksArr = loseStacksFiltered.map(x => x.s)
    const losePrizes = validPrizes.slice(0, loseStacksArr.length)
    const loseEquities = calculateICM(loseStacksArr, losePrizes)
    const heroLoseIdxPush = loseStacksFiltered.findIndex(x => x.i === heroIdx)
    const evLosePush = heroLoseIdxPush >= 0 ? loseEquities[heroLoseIdxPush] : 0

    const callFreq = Math.min(villainRange.length / 100, 0.9)
    const pushEV = callFreq * (eq * evWinPush + (1 - eq) * evLosePush)
      + (1 - callFreq) * evFoldPush
      - baseEquity

    // --- Call EV (hero faces villain push) ---
    // hero calls and wins
    const winStacksCall = [...stacks]
    winStacksCall[heroIdx] = heroStack + effectiveStack
    winStacksCall[villainIdx] = villainStack - effectiveStack
    const winCallFiltered = winStacksCall.map((s, i) => ({ s, i })).filter(x => x.s > 0)
    const winCallArr = winCallFiltered.map(x => x.s)
    const winCallPrizes = validPrizes.slice(0, winCallArr.length)
    const winCallEquities = calculateICM(winCallArr, winCallPrizes)
    const heroWinIdxCall = winCallFiltered.findIndex(x => x.i === heroIdx)
    const evWinCall = heroWinIdxCall >= 0 ? winCallEquities[heroWinIdxCall] : 0

    // hero calls and loses
    const loseStacksCall = [...stacks]
    loseStacksCall[villainIdx] = villainStack + effectiveStack
    loseStacksCall[heroIdx] = heroStack - effectiveStack
    const loseCallFiltered = loseStacksCall.map((s, i) => ({ s, i })).filter(x => x.s > 0)
    const loseCallArr = loseCallFiltered.map(x => x.s)
    const loseCallPrizes = validPrizes.slice(0, loseCallArr.length)
    const loseCallEquities = calculateICM(loseCallArr, loseCallPrizes)
    const heroLoseIdxCall = loseCallFiltered.findIndex(x => x.i === heroIdx)
    const evLoseCall = heroLoseIdxCall >= 0 ? loseCallEquities[heroLoseIdxCall] : 0

    // hero folds to push
    const evFoldCall = baseEquity

    const callEV = eq * evWinCall + (1 - eq) * evLoseCall - evFoldCall

    results.push({
      hand: h,
      pushEV,
      callEV,
      shouldPush: pushEV > 0,
      shouldCall: callEV > 0,
      equity: eq,
    })
  }

  return results
}
