/** Common English words for the typing test (lowercase, no punctuation). */
export const WORDS: string[] = [
  'the', 'of', 'and', 'to', 'in', 'is', 'you', 'that', 'it', 'he', 'was', 'for', 'on', 'are',
  'as', 'with', 'his', 'they', 'at', 'be', 'this', 'have', 'from', 'or', 'one', 'had', 'by',
  'word', 'but', 'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there',
  'use', 'an', 'each', 'which', 'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other',
  'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would', 'make',
  'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more', 'write', 'go', 'see', 'number',
  'no', 'way', 'could', 'people', 'my', 'than', 'first', 'water', 'been', 'call', 'who',
  'oil', 'its', 'now', 'find', 'long', 'down', 'day', 'did', 'get', 'come', 'made', 'may',
  'part', 'over', 'new', 'sound', 'take', 'only', 'little', 'work', 'know', 'place', 'year',
  'live', 'me', 'back', 'give', 'most', 'very', 'after', 'thing', 'our', 'just', 'name',
  'good', 'sentence', 'man', 'think', 'say', 'great', 'where', 'help', 'through', 'much',
  'before', 'line', 'right', 'too', 'mean', 'old', 'any', 'same', 'tell', 'boy', 'follow',
  'came', 'want', 'show', 'also', 'around', 'form', 'three', 'small', 'set', 'put', 'end',
  'does', 'another', 'well', 'large', 'must', 'big', 'even', 'such', 'because', 'turn',
  'here', 'why', 'ask', 'went', 'men', 'read', 'need', 'land', 'different', 'home', 'move',
  'try', 'kind', 'hand', 'picture', 'again', 'change', 'off', 'play', 'spell', 'air',
  'away', 'animal', 'house', 'point', 'page', 'letter', 'mother', 'answer', 'found',
  'study', 'still', 'learn', 'should', 'world', 'high', 'every', 'near', 'add', 'food',
  'between', 'own', 'below', 'country', 'plant', 'last', 'school', 'father', 'keep',
  'tree', 'never', 'start', 'city', 'earth', 'eye', 'light', 'thought', 'head', 'under',
  'story', 'saw', 'left', 'few', 'while', 'along', 'might', 'close', 'something', 'seem',
  'next', 'hard', 'open', 'example', 'begin', 'life', 'always', 'those', 'both', 'paper',
  'together', 'got', 'group', 'often', 'run', 'important', 'until', 'children', 'side',
  'feet', 'car', 'mile', 'night', 'walk', 'white', 'sea', 'began', 'grow', 'took', 'river',
  'four', 'carry', 'state', 'once', 'book', 'hear', 'stop', 'without', 'second', 'later',
  'miss', 'idea', 'enough', 'eat', 'face', 'watch', 'far', 'really', 'almost', 'let',
  'above', 'girl', 'sometimes', 'mountain', 'cut', 'young', 'talk', 'soon', 'list', 'song',
  'being', 'leave', 'family', 'body', 'music', 'color', 'stand', 'sun', 'question', 'fish',
  'area', 'mark', 'dog', 'hour', 'table', 'fast', 'early', 'hold', 'voice', 'friend',
]

/** A fresh shuffled stream of `count` words for one run. */
export function generateWords(count: number): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    out.push(WORDS[Math.floor(Math.random() * WORDS.length)])
  }
  return out
}
