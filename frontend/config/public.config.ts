// MANUELL: einzige Stelle fuer die Impressum-Pflichtangaben — hier die
// eigenen Daten eintragen (verwendet von /impressum und /datenschutz).
export const LEGAL_INFO = {
  name: '<NAME>',
  address: '<ANSCHRIFT>',
  email: '<EMAIL>',
} as const

export const PUBLIC_CONFIG = {
  banScreen: {
    text: process.env.NEXT_PUBLIC_BAN_SCREEN_TEXT ?? 'Dein Account wurde gesperrt.',
    audioFiles: [
      'bing-bong_mov.mp3',
      'drachenlord-sirene.mp3',
      'john-cena_5.mp3',
      'nani_-meme-sound-effect-su0k4q3yrfw-mp3cut.mp3',
      'nokia-kick-ringtone.mp3',
      'when-do-me-and-you-have-a-sexy-intercourse.mp3',
      'youre-banned.mp3',
      'you_were_banned_1_ZBqWsq8.mp3',
    ],
  },
  // more entries will follow
} as const
