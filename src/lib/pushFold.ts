import { calculateICM } from './icm'
import { monteCarloEquity, handKeyToRanks } from './handEquity'

// All 169 hand keys in standard order
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

// Approximate combos per hand type
export function combosInRange(range: string[]): number {
  return range.reduce((sum, h) => {
    if (h.length === 2) return sum + 6       // pair
    if (h.endsWith('s')) return sum + 4      // suited
    return sum + 12                           // offsuit
  }, 0)
}

// Top X% of hands by rough strength order
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
  pushEV: number      // ICM EV of pushing (vs folding)
  callEV: number      // ICM EV of calling villain push (vs folding)
  shouldPush: boolean
  shouldCall: boolean
  equity: number
}

export async function calcPushEV(
  heroIdx: number,
  stacks: number[],
  prizes: number[],
  hand: string,
  villainCallRange: string[],
  blinds: { sb: number; bb: number },
  onProgress?: (pct: number) => void
): Promise<PushCallResult[]> {
  const results: PushCallResult[] = []
  const validPrizes = prizes.filter(p=>p>0).sort((a,b)=>b-a)
  const baseEquity = calculateICM(stacks, validPrizes)[heroIdx]
  const heroStack = stacks[heroIdx]

  const hands = hand === 'all' ? ALL_HANDS : [hand]

  for (let hi = 0; hi < hands.length; hi++) {
    const h = hands[hi]
    if (onProgress) onProgress(Math.round((hi/hands.length)*100))

    const [r1,r2] = handKeyToRanks(h)
    const suited = h.endsWith('s')
    const s1 = 0, s2 = suited ? 0 : 1

    // Equity vs villain call range
    const eq = villainCallRange.length > 0
      ? monteCarloEquity(r1, r2, s1, s2, villainCallRange, [], 400)
      : 0.5

    // --- Push EV ---
    // Find villain (call scenario: first other player, simplified to one caller)
    const callerIdx = stacks.findIndex((_, i) => i !== heroIdx)

    // If villain folds: hero wins blinds
    const foldStacks = [...stacks]
    foldStacks[heroIdx] = heroStack + blinds.bb
    const evFold = calculateICM(foldStacks, validPrizes)[heroIdx]

    // If villain calls and hero wins
    const winStacks = [...stacks]
    const callerStack = stacks[callerIdx]
    const pot = Math.min(heroStack, callerStack)
    winStacks[heroIdx] = heroStack + pot
    winStacks[callerIdx] = callerStack - pot
    const evWin = calculateICM(winStacks, validPrizes)[heroIdx]

    // If villain calls and hero loses
    const loseStacks = [...stacks]
    loseStacks[callerIdx] = callerStack + pot
    loseStacks[heroIdx] = heroStack - pot
    const evLose = calculateICM(loseStacks.filter((_,i)=>loseStacks[i]>0), validPrizes.slice(0, loseStacks.filter(s=>s>0).length))[Math.max(0,heroIdx-1)]

    // callFreq: fraction of villain range that calls
    const callFreq = Math.min(villainCallRange.length / 169, 1)
    const pushEV = callFreq * (eq * evWin + (1-eq) * (evLose ?? 0)) + (1-callFreq) * evFold - baseEquity

    // --- Call EV (hero faces a push) ---
    const callEV = eq * evWin + (1-eq) * (evLose ?? 0) - baseEquity

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
