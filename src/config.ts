// TextAlive App API token — obtained via developer registration at
// https://developer.textalive.jp/profile/  (this is a public client-side token).
export const TEXTALIVE_TOKEN = "jWtZv4SQXsf1iJrc";

// Contest song: "こたえて" (Answer Me) / imie feat. 初音ミク — Magical Mirai 2026 grand prize.
// IDs are the official values from https://developer.textalive.jp/events/magicalmirai2026/
export const SONG = {
  title: "こたえて (Answer Me)",
  artist: "imie feat. 初音ミク",
  url: "https://piapro.jp/t/6W2N/20251215164617",
  video: {
    beatId: 4827293,
    chordId: 2963754,
    repetitiveSegmentId: 3086261,
    lyricId: 126519,
    lyricDiffId: 28645,
  },
};

// English translation, one entry per TextAlive phrase (38 total, in song order),
// shown as a subtitle. A few chorus lines reorder in English grammar; each is
// attached to the phrase whose Japanese it translates so subtitles stay in sync.
export const ENGLISH: string[] = [
  "Shining with a brilliance all its own, you pass along the main avenue.",
  "People gather, drawn by the desire to see you;",
  "and there, I stand—lost among the crowd.",

  "You waved your hand.",
  "I waved back, and the excitement surged.",
  "You raised your voice.",
  "I listened in silence,",
  "hearing my own story echoed in your words.",

  "Beyond the depths of all suffering and sorrow,",
  "I held fast to the belief that the person I aspire to be surely awaits me.",

  "My awakened heart begins to stir restlessly.",
  "Where is the future leading us?",

  "Even if I were to search this world to its very ends,",
  "I would find no answer to my questions.",
  "Neither foresight nor even memory itself",
  "seems to be a reliable guide.",
  "within this colorless world right before your eyes,",
  "perhaps, if you simply live—in your own unique way—",
  "the radiance you emit might be exactly what I've been searching for.",

  "I know the truth.",
  "The answer was there all along.",
  "Yet I'll pretend not to know it—and keep on running.",

  '"You can still go on!" "It\'s already over!"',
  '"I have high hopes for you!" "You\'ll live to regret this!"',
  "Voices—forever parallel, never to meet—are screaming out.",

  "If you were in my shoes, what answer would you find?",
  "If I were in yours, I know I would surely lose my way.",

  "Every word spoken is merely a fragment—a scrap of someone's proof of existence—",
  "so why is my heart shaken so deeply?",

  "Even if I were to search this world to its very ends,",
  "I would find no answer to my questions.",
  "Reaching out, straining my eyes, wandering aimlessly...",
  "within this colorless world that has now come into view,",
  "if you simply live—in your own unique way—",
  "perhaps that very existence will become the answer.",

  "I will keep going. I will not lose my way.",
  "I have high hopes. I will have no regrets.",
  "A voice—audible wherever I am—is screaming out.",
];
