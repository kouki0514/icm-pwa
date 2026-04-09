// Monte Carlo equity estimation: hole cards vs villain range
// Returns equity [0,1] for hero

const RANKS = '23456789TJQKA'
// suits used inline

function cardIndex(r: number, s: number) { return r * 4 + s }

function buildDeck(): number[] {
  const d: number[] = []
  for (let r = 0; r < 13; r++) for (let s = 0; s < 4; s++) d.push(cardIndex(r, s))
  return d
}

// Hand strength via 7-card eval (simplified fast evaluator)
function handRank(cards: number[]): number {
  // Convert to rank/suit arrays
  const rs = cards.map(c => Math.floor(c / 4))
  const ss = cards.map(c => c % 4)
  return evaluate7(rs, ss)
}

function evaluate7(rs: number[], ss: number[]): number {
  let best = 0
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      const five = [0,1,2,3,4,5,6].filter(x => x!==i && x!==j)
      const v = evaluate5(five.map(x=>rs[x]), five.map(x=>ss[x]))
      if (v > best) best = v
    }
  }
  return best
}

function evaluate5(rs: number[], ss: number[]): number {
  const flush = ss.every(s => s === ss[0])
  const sorted = [...rs].sort((a,b) => b-a)
  const straight = isStraight(sorted)
  const counts = countGroups(sorted)

  if (flush && straight) return 8000000 + sorted[0]
  if (counts[0] === 4) return 7000000 + sorted.find(r => rs.filter(x=>x===r).length===4)! * 100
  if (counts[0] === 3 && counts[1] === 2) return 6000000 + sorted[0]
  if (flush) return 5000000 + sorted.reduce((a,r,i)=>a+r*Math.pow(13,4-i),0)
  if (straight) return 4000000 + sorted[0]
  if (counts[0] === 3) return 3000000 + sorted.find(r=>rs.filter(x=>x===r).length===3)!*100
  if (counts[0] === 2 && counts[1] === 2) {
    const pairs = sorted.filter(r=>rs.filter(x=>x===r).length===2)
    return 2000000 + Math.max(...pairs)*100 + Math.min(...pairs)
  }
  if (counts[0] === 2) return 1000000 + sorted.find(r=>rs.filter(x=>x===r).length===2)!*100 + sorted.find(r=>rs.filter(x=>x===r).length===1)!
  return sorted.reduce((a,r,i)=>a+r*Math.pow(13,4-i),0)
}

function isStraight(sorted: number[]): boolean {
  if (sorted[0]-sorted[4]===4 && new Set(sorted).size===5) return true
  if (JSON.stringify(sorted)==='[12,3,2,1,0]') return true
  return false
}

function countGroups(sorted: number[]): number[] {
  const map: Record<number,number> = {}
  sorted.forEach(r => { map[r]=(map[r]||0)+1 })
  return Object.values(map).sort((a,b)=>b-a)
}

// handKey: e.g. 'AKs', 'AKo', 'AA'
export function handKeyToRanks(key: string): [number,number] {
  const r1 = RANKS.indexOf(key[0])
  const r2 = RANKS.indexOf(key[1])
  return [r1, r2]
}

export function monteCarloEquity(
  heroR1: number, heroR2: number, heroS1: number, heroS2: number,
  villainRange: string[],
  board: number[] = [],
  iterations = 1000
): number {
  const deck = buildDeck().filter(c =>
    c !== cardIndex(heroR1,heroS1) && c !== cardIndex(heroR2,heroS2) && !board.includes(c)
  )

  // Build villain combos from range
  const villainCombos: [number,number,number,number][] = []
  for (const key of villainRange) {
    const [r1,r2] = handKeyToRanks(key)
    const suited = key.endsWith('s')
    const pair = key.length === 2 && key[0] === key[1]
    if (pair) {
      for (let s1=0;s1<4;s1++) for (let s2=s1+1;s2<4;s2++) {
        const c1=cardIndex(r1,s1),c2=cardIndex(r2,s2)
        if (c1!==cardIndex(heroR1,heroS1)&&c1!==cardIndex(heroR2,heroS2)&&
            c2!==cardIndex(heroR1,heroS1)&&c2!==cardIndex(heroR2,heroS2))
          villainCombos.push([r1,s1,r2,s2])
      }
    } else if (suited) {
      for (let s=0;s<4;s++) {
        const c1=cardIndex(r1,s),c2=cardIndex(r2,s)
        if (c1!==cardIndex(heroR1,heroS1)&&c1!==cardIndex(heroR2,heroS2)&&
            c2!==cardIndex(heroR1,heroS1)&&c2!==cardIndex(heroR2,heroS2))
          villainCombos.push([r1,s,r2,s])
      }
    } else {
      for (let s1=0;s1<4;s1++) for (let s2=0;s2<4;s2++) { if (s1===s2) continue
        const c1=cardIndex(r1,s1),c2=cardIndex(r2,s2)
        if (c1!==cardIndex(heroR1,heroS1)&&c1!==cardIndex(heroR2,heroS2)&&
            c2!==cardIndex(heroR1,heroS1)&&c2!==cardIndex(heroR2,heroS2))
          villainCombos.push([r1,s1,r2,s2])
      }
    }
  }
  if (villainCombos.length === 0) return 0.5

  let wins = 0, total = 0
  for (let i = 0; i < iterations; i++) {
    const vc = villainCombos[Math.floor(Math.random()*villainCombos.length)]
    const [vr1,vs1,vr2,vs2] = vc
    const vc1 = cardIndex(vr1,vs1), vc2 = cardIndex(vr2,vs2)
    const avail = deck.filter(c => c!==vc1 && c!==vc2)
    const needed = 5 - board.length
    const shuffled = avail.sort(()=>Math.random()-0.5).slice(0,needed)
    const community = [...board, ...shuffled]
    const h1 = cardIndex(heroR1,heroS1), h2 = cardIndex(heroR2,heroS2)
    const heroScore = handRank([h1,h2,...community])
    const villScore = handRank([vc1,vc2,...community])
    if (heroScore > villScore) wins += 1
    else if (heroScore === villScore) wins += 0.5
    total++
  }
  return total > 0 ? wins/total : 0.5
}
