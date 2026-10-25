import {
  Brain,
  Crosshair,
  Hash,
  Keyboard,
  LayoutGrid,
  ListOrdered,
  MousePointerClick,
  MoveVertical,
  Palette,
  Shuffle,
  Space,
  SpellCheck,
  Target,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ScoreDirection } from '../lib/results'

export type GameId =
  | 'typing'
  | 'cps'
  | 'spacebar'
  | 'one-to-hundred'
  | 'scroll'
  | 'reaction'
  | 'key-reaction'
  | 'mouse-accuracy'
  | 'number-memory'
  | 'visual-memory'
  | 'sequence-memory'
  | 'color-reaction'
  | 'word-unscramble'
  | 'typing-accuracy'

export interface GameMeta {
  id: GameId
  name: string
  tagline: string
  description: string
  howTo: string[]
  accent: string // hex, drives the game's neon accent
  icon: LucideIcon
  better: ScoreDirection // which direction of the primary metric is a better score
}

export const GAMES: GameMeta[] = [
  {
    id: 'typing',
    name: 'Typing Speed',
    tagline: 'Words per minute & accuracy',
    description:
      'Type the flowing word stream as fast and cleanly as you can. Live WPM, per-character error highlighting and three timed modes.',
    howTo: [
      'Pick a duration: 30, 60 or 120 seconds. The clock starts on your first keystroke.',
      'Type each word and press Space to move to the next one. Backspace fixes the current word.',
      'Correct characters glow; wrong ones turn red. Your score is net WPM with accuracy.',
    ],
    accent: '#22d3ee',
    icon: Keyboard,
    better: 'higher',
  },
  {
    id: 'cps',
    name: 'CPS Test',
    tagline: 'Clicks per second',
    description:
      'Mash the pad as fast as physically possible. Counts every valid click and converts it into a clicks-per-second rating.',
    howTo: [
      'Choose a duration: 1, 2, 5 or 10 seconds.',
      'Your first click starts the clock — keep clicking until time runs out.',
      'Score = total valid clicks ÷ duration. Only the primary button counts.',
    ],
    accent: '#e879f9',
    icon: MousePointerClick,
    better: 'higher',
  },
  {
    id: 'spacebar',
    name: 'Spacebar Challenge',
    tagline: 'Spacebar presses under time',
    description:
      'A pure spacebar sprint. Hit the spacebar as many times as you can before the timer expires — no scrolling, no double-counts.',
    howTo: [
      'Choose a duration: 5, 10 or 30 seconds.',
      'Your first press starts the clock. Held-down repeats are ignored — every press is your own.',
      'On touch devices, tap the large pad instead of the keyboard.',
    ],
    accent: '#a3e635',
    icon: Space,
    better: 'higher',
  },
  {
    id: 'one-to-hundred',
    name: 'Type 1 to 100',
    tagline: 'Beat the clock to 100',
    description:
      'Type every number from 1 to 100 in order before time runs out. Pick a 30–120 second limit; wrong entries cost mistakes and never advance the sequence.',
    howTo: [
      'Pick a time limit: 30, 60, 90 or 120 seconds. The countdown starts on your first correct number.',
      'Type the next number in sequence and press Enter (or tap Send). Wrong entries count as mistakes and do not advance.',
      'Reach 100 before the clock hits zero to record your time. A timed-out attempt is not scored.',
    ],
    accent: '#fbbf24',
    icon: Hash,
    better: 'lower',
  },
  {
    id: 'scroll',
    name: 'Scroll Speed',
    tagline: 'Bottom of the page, fast',
    description:
      'A 10,000-pixel gauntlet. The clock starts the moment you begin scrolling and stops at the finish line — mouse wheel, trackpad or thumb.',
    howTo: [
      'Press Start, then scroll. The timer begins with your very first scroll movement.',
      'Follow the track markers down to the checkered finish line.',
      'Reaching the bottom stops the clock and records your time and average speed.',
    ],
    accent: '#38bdf8',
    icon: MoveVertical,
    better: 'lower',
  },
  {
    id: 'reaction',
    name: 'Reaction Time',
    tagline: 'See green, click',
    description:
      'Five rounds of pure reflex. Wait through a randomized delay, then click the instant the panel turns green. Early clicks are fouls.',
    howTo: [
      'Click to arm each round, then wait — the delay is random every time.',
      'Click the moment the panel turns green. Jumping the gun is a foul and you redo the round.',
      'Your score is the average of 5 valid rounds, with best and worst shown.',
    ],
    accent: '#fb7185',
    icon: Zap,
    better: 'lower',
  },
  {
    id: 'key-reaction',
    name: 'Key Reaction Test',
    tagline: 'See a key, press it',
    description:
      'A random letter appears — smash that exact key as fast as you can. Wrong keys are rejected and counted; five rounds decide your average.',
    howTo: [
      'Press Start (or any key), then wait for the target letter to appear.',
      'Hit exactly the key shown. Wrong keys are rejected and logged as misses.',
      'Score is the average response time over 5 rounds. On touch devices, tap the on-screen keys.',
    ],
    accent: '#c084fc',
    icon: Target,
    better: 'lower',
  },
  {
    id: 'mouse-accuracy',
    name: 'Mouse Accuracy',
    tagline: 'Hit 25 shrinking targets',
    description:
      'Twenty-five targets pop up at random positions and get smaller as you go. Click them, and nothing else — every stray click counts against your accuracy.',
    howTo: [
      'Press Start, then click each circle the moment it appears. Touch works too.',
      'Targets shrink as you progress. Clicking the arena instead of a target is a miss.',
      'Your score is hit accuracy, with average time per target as the pace metric.',
    ],
    accent: '#fb923c',
    icon: Crosshair,
    better: 'higher',
  },
  {
    id: 'number-memory',
    name: 'Number Memory',
    tagline: 'Recall growing numbers',
    description:
      'A number flashes on screen and disappears. Type it back from memory — each level adds a digit. Three slips and the run is over.',
    howTo: [
      'Memorize the number during the viewing window, then type it back exactly.',
      'Every cleared level adds one digit. The number is reshown if you slip.',
      'Three wrong answers end the run. Your score is the longest number you recalled.',
    ],
    accent: '#2dd4bf',
    icon: Brain,
    better: 'higher',
  },
  {
    id: 'visual-memory',
    name: 'Visual Memory',
    tagline: 'Reproduce tile patterns',
    description:
      'A pattern of tiles flashes on a grid, then vanishes. Click the tiles you saw — clear the pattern to advance, where grids grow and patterns densify.',
    howTo: [
      'Study the highlighted tiles while they are lit, then reproduce the pattern from memory.',
      'Correct tiles stay lit. Wrong clicks cost one of your three lives but keep your progress.',
      'Clear a pattern to reach a bigger grid. Score is the number of levels you cleared.',
    ],
    accent: '#818cf8',
    icon: LayoutGrid,
    better: 'higher',
  },
  {
    id: 'sequence-memory',
    name: 'Sequence Memory',
    tagline: 'Repeat the growing sequence',
    description:
      'Nine pads flash a sequence that grows by one every round. Watch, remember, repeat — one wrong pad ends the run.',
    howTo: [
      'Watch the pads light up, then repeat the sequence in the exact order.',
      'Each cleared round adds one more step to the same sequence.',
      'A single wrong pad ends the run. Score is the longest sequence you completed.',
    ],
    accent: '#f472b6',
    icon: ListOrdered,
    better: 'higher',
  },
  {
    id: 'color-reaction',
    name: 'Color Reaction',
    tagline: 'Stroop test · 10 rounds',
    description:
      'A color word appears printed in a different color. Ignore what it says — click the ink color as fast as you can, ten rounds in a row.',
    howTo: [
      'Respond to the COLOR the word is printed in, never the word itself.',
      'Tap the matching color button — or press keys 1–4 for red, green, blue, yellow.',
      'Score is your average correct response time; wrong answers are counted separately.',
    ],
    accent: '#eab308',
    icon: Palette,
    better: 'lower',
  },
  {
    id: 'word-unscramble',
    name: 'Word Unscramble',
    tagline: 'Unscramble in 60 seconds',
    description:
      'Sixty seconds, a pile of scrambled words. Rebuild each one letter by letter — case does not matter, speed and a good vocabulary do.',
    howTo: [
      'Press Start, then type the unscrambled word and hit Enter (or tap Send).',
      'Answers are case-insensitive; wrong guesses shake but the word stays yours to retry.',
      'Stuck? Skip moves on without a score. Most words solved before the buzzer wins.',
    ],
    accent: '#4ade80',
    icon: Shuffle,
    better: 'higher',
  },
  {
    id: 'typing-accuracy',
    name: 'Typing Accuracy Mode',
    tagline: '15 words, zero mistakes',
    description:
      'No clock pressure — just fifteen words and your precision. Every keystroke is graded, so slow down, aim for 100%, and let speed follow.',
    howTo: [
      'Type the fifteen words and press Space between them. Backspace fixes the current word.',
      'There is no time limit: the run ends when the last word is submitted.',
      'Your score is keystroke accuracy, with clean words and pace as details.',
    ],
    accent: '#10b981',
    icon: SpellCheck,
    better: 'higher',
  },
]

export function getGame(id: string): GameMeta | undefined {
  return GAMES.find((g) => g.id === id)
}
