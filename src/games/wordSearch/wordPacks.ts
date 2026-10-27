/**
 * Themed word packs for Word Search Infinite — bundled locally, no network.
 * Words are normalized to A–Z by the engine; hyphens and spaces in labels
 * are fine (they vanish in the grid).
 */

export interface WordPack {
  name: string
  words: string[]
}

export const WORD_PACKS: WordPack[] = [
  {
    name: 'Animals',
    words: [
      'Tiger', 'Zebra', 'Dolphin', 'Falcon', 'Rabbit', 'Panther', 'Otter', 'Giraffe',
      'Penguin', 'Cheetah', 'Badger', 'Walrus', 'Iguana', 'Gazelle', 'Hedgehog', 'Raccoon',
      'Leopard', 'Manatee', 'Opossum', 'Chamois', 'Kestrel', 'Narwhal', 'Ocelot', 'Puffin',
      'Wolverine', 'Armadillo', 'Chimpanzee', 'Crocodile', 'Butterfly', 'Rhinoceros',
    ],
  },
  {
    name: 'Travel',
    words: [
      'Passport', 'Luggage', 'Airport', 'Journey', 'Cruise', 'Hostel', 'Backpack', 'Terminal',
      'Itinerary', 'Souvenir', 'Map', 'Visa', 'Compass', 'Suitcase', 'Departure', 'Arrival',
      'Safari', 'Voyage', 'Cabin', 'Lantern', 'Excursion', 'Landmark', 'Harbor', 'Station',
    ],
  },
  {
    name: 'Science',
    words: [
      'Atom', 'Photon', 'Neutron', 'Enzyme', 'Orbit', 'Gravity', 'Molecule', 'Catalyst',
      'Element', 'Fission', 'Plasma', 'Vertex', 'Quasar', 'Isotope', 'Kinetic', 'Voltage',
      'Entropy', 'Nebula', 'Bacteria', 'Chromosome', 'Telescope', 'Hypothesis', 'Magnetic',
    ],
  },
  {
    name: 'Technology',
    words: [
      'Router', 'Server', 'Pixel', 'Cache', 'Kernel', 'Binary', 'Cipher', 'Cloud',
      'Cursor', 'Servlet', 'Ethernet', 'Algorithm', 'Database', 'Firewall', 'Laptop', 'Robot',
      'Sensor', 'Torque', 'Widget', 'Console', 'Digital', 'Network', 'Quantum', 'Silicon',
    ],
  },
  {
    name: 'Food',
    words: [
      'Basil', 'Mango', 'Noodle', 'Pepper', 'Olive', 'Waffle', 'Curry', 'Muffin',
      'Pretzel', 'Salmon', 'Tofu', 'Vanilla', 'Avocado', 'Dumpling', 'Espresso', 'Granola',
      'Kebab', 'Lasagna', 'Pancake', 'Saffron', 'Turmeric', 'Zucchini', 'Croissant', 'Ravioli',
    ],
  },
  {
    name: 'Sports',
    words: [
      'Anchor', 'Bicycle', 'Coach', 'Dribble', 'Foul', 'Goal', 'Helmet', 'Inning',
      'Jersey', 'Kayak', 'League', 'Medal', 'Olympic', 'Puck', 'Racket', 'Stadium',
      'Tackle', 'Umpire', 'Victory', 'Whistle', 'Sprint', 'Marathon', 'Penalty', 'Champion',
    ],
  },
  {
    name: 'Nature',
    words: [
      'Canyon', 'Fern', 'Glacier', 'Horizon', 'Island', 'Jungle', 'Lagoon', 'Moss',
      'Orchard', 'Prairie', 'Quarry', 'River', 'Summit', 'Thunder', 'Valley', 'Willow',
      'Blossom', 'Desert', 'Fossil', 'Meadow', 'Reef', 'Tundra', 'Waterfall', 'Sunrise',
    ],
  },
  {
    name: 'General',
    words: [
      'Anchor', 'Bronze', 'Candle', 'Dawn', 'Echo', 'Fortune', 'Garden', 'Harbor',
      'Ivory', 'Jacket', 'Kite', 'Lantern', 'Mirror', 'Noble', 'Orbit', 'Puzzle',
      'Quill', 'Ribbon', 'Shadow', 'Timber', 'Umbrella', 'Velvet', 'Whisper', 'Zephyr',
    ],
  },
]

export function pickPack(level: number, rng: () => number = Math.random): WordPack {
  // Rotate packs deterministically by level so runs vary without repeats.
  const index = (Math.max(1, level) - 1) % WORD_PACKS.length
  void rng
  return WORD_PACKS[index]
}
