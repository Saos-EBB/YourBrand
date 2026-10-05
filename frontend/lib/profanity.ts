import leoProfanity from 'leo-profanity'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

let cachedWords: string[] = []

export async function initProfanityFilter(): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/moderation/wordlist`)
    if (!res.ok) return
    const data = await res.json() as { words: string[] }
    cachedWords = data.words
    leoProfanity.add(cachedWords)
  } catch {
    // silent fail — app still works without the custom word list
  }
}

export function blurText(text: string): string {
  return leoProfanity.clean(text)
}

export function hasProfanity(text: string): boolean {
  return leoProfanity.check(text)
}
