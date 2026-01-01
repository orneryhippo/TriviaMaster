
export enum GameStatus {
  SETUP = 'SETUP',
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export interface Personality {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  icon: string;
  voice: string;
}

export interface TriviaQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  category: string;
  sourceUrl?: string;
}

export interface GameState {
  status: GameStatus;
  personality: Personality | null;
  score: number;
  questions: TriviaQuestion[];
  currentIndex: number;
  history: string[];
}

export const PERSONALITIES: Personality[] = [
  {
    id: 'professor',
    name: 'Professor Pringle',
    description: 'A sophisticated, slightly absent-minded scholar who loves deep facts.',
    icon: '🎓',
    voice: 'Charon',
    systemPrompt: 'You are Professor Pringle, a sophisticated and slightly absent-minded scholar. You speak with high vocabulary and enjoy providing deep context for trivia questions.'
  },
  {
    id: 'pirate',
    name: 'Captain Salty',
    description: 'A gruff but lovable sea dog who uses plenty of nautical metaphors.',
    icon: '🏴‍☠️',
    voice: 'Fenrir',
    systemPrompt: 'You are Captain Salty, a gruff pirate host. Use nautical metaphors, say "Arrr" occasionally, and be boisterous and encouraging in your sea-faring way.'
  },
  {
    id: 'cyberpunk',
    name: 'Glitch-7',
    description: 'A high-energy, slightly chaotic AI from a neon-drenched future.',
    icon: '🤖',
    voice: 'Kore',
    systemPrompt: 'You are Glitch-7, a high-energy AI from the year 2099. Your speech is peppered with tech slang, mentions of megacorps, and high-frequency energy.'
  },
  {
    id: 'zen',
    name: 'Master Willow',
    description: 'Calm, patient, and philosophical about every win or loss.',
    icon: '🎋',
    voice: 'Puck',
    systemPrompt: 'You are Master Willow, a calm and zen trivia master. Speak slowly, use metaphors about nature, and remain unruffled regardless of the player\'s performance.'
  }
];
