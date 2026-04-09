export function calculateICM(stacks: number[], prizes: number[]): number[] {
  const n = stacks.length
  if (n === 0) return []
  if (prizes.length === 0) return new Array(n).fill(0)
  const sortedPrizes = [...prizes].sort((a, b) => b - a)
  const equity = new Array(n).fill(0)
  if (n <= 9) {
    function recurse(remaining: number[], indices: number[], prizeIdx: number, prob: number) {
      if (prizeIdx >= sortedPrizes.length || remaining.length === 0) return
      const total = remaining.reduce((a, b) => a + b, 0)
      if (total === 0) return
      for (let i = 0; i < remaining.length; i++) {
        const p = remaining[i] / total
        equity[indices[i]] += prob * p * sortedPrizes[prizeIdx]
        recurse(remaining.filter((_, j) => j !== i), indices.filter((_, j) => j !== i), prizeIdx + 1, prob * p)
      }
    }
    recurse(stacks, stacks.map((_, i) => i), 0, 1)
  } else {
    const totalChips = stacks.reduce((a, b) => a + b, 0)
    const totalPrize = sortedPrizes.reduce((a, b) => a + b, 0)
    for (let i = 0; i < n; i++) equity[i] = (stacks[i] / totalChips) * totalPrize
  }
  return equity
}
