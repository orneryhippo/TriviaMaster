
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameStatus, PERSONALITIES, GameState, TriviaQuestion, Personality } from './types';
import { generateTriviaBatch, generateTTS, connectLiveHost } from './geminiService';
import { createPcmBlob, decode, decodeAudioData } from './audioUtils';

const App: React.FC = () => {
  const [game, setGame] = useState<GameState>({
    status: GameStatus.SETUP,
    personality: null,
    score: 0,
    questions: [],
    currentIndex: 0,
    history: []
  });

  const [topic, setTopic] = useState('World History');
  const [isLoading, setIsLoading] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  
  // Audio contexts
  const inputAudioCtx = useRef<AudioContext | null>(null);
  const outputAudioCtx = useRef<AudioContext | null>(null);
  const liveSession = useRef<any>(null);
  const nextStartTime = useRef(0);
  const activeSources = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Cleanup
  useEffect(() => {
    return () => {
      if (liveSession.current) liveSession.current.close();
      inputAudioCtx.current?.close();
      outputAudioCtx.current?.close();
    };
  }, []);

  const startGame = async (p: Personality) => {
    setIsLoading(true);
    setGame(prev => ({ ...prev, status: GameStatus.LOADING, personality: p }));
    
    try {
      const questions = await generateTriviaBatch(topic);
      if (questions.length === 0) throw new Error("No questions generated");

      setGame(prev => ({
        ...prev,
        status: GameStatus.PLAYING,
        questions,
        currentIndex: 0,
        score: 0
      }));

      // Intro with TTS
      const introText = `Welcome to Gemini Trivia! I am your host, ${p.name}. Today's topic is ${topic}. Are you ready for the first question?`;
      const introAudio = await generateTTS(introText, p.voice);
      if (introAudio) playAudioString(introAudio);
    } catch (err) {
      console.error(err);
      alert("Failed to start game. Check your API key or connection.");
      setGame(prev => ({ ...prev, status: GameStatus.SETUP }));
    } finally {
      setIsLoading(false);
    }
  };

  const playAudioString = async (base64: string) => {
    if (!outputAudioCtx.current) {
      outputAudioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const ctx = outputAudioCtx.current;
    const data = decode(base64);
    const buffer = await decodeAudioData(data, ctx, 24000, 1);
    
    nextStartTime.current = Math.max(nextStartTime.current, ctx.currentTime);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(nextStartTime.current);
    nextStartTime.current += buffer.duration;
    
    source.onended = () => {
      activeSources.current.delete(source);
    };
    activeSources.current.add(source);
  };

  const toggleLive = async () => {
    if (isLiveActive) {
      liveSession.current?.close();
      setIsLiveActive(false);
      return;
    }

    if (!game.personality) return;

    try {
      const session = await connectLiveHost(game.personality, {
        score: game.score,
        currentQuestion: game.questions[game.currentIndex],
        index: game.currentIndex,
        total: game.questions.length
      }, {
        onAudio: (base64) => playAudioString(base64),
        onInterrupted: () => {
          activeSources.current.forEach(s => s.stop());
          activeSources.current.clear();
          nextStartTime.current = 0;
        }
      });

      liveSession.current = session;
      setIsLiveActive(true);

      // Start mic
      if (!inputAudioCtx.current) {
        inputAudioCtx.current = new AudioContext({ sampleRate: 16000 });
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = inputAudioCtx.current.createMediaStreamSource(stream);
      const processor = inputAudioCtx.current.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmBlob = createPcmBlob(inputData);
        session.sendRealtimeInput({ media: pcmBlob });
      };

      source.connect(processor);
      processor.connect(inputAudioCtx.current.destination);

    } catch (err) {
      console.error("Live failed", err);
      alert("Microphone access is required for Live mode.");
    }
  };

  const handleAnswer = (option: string) => {
    const isCorrect = option === game.questions[game.currentIndex].correctAnswer;
    const newScore = isCorrect ? game.score + 10 : game.score;
    
    if (game.currentIndex + 1 >= game.questions.length) {
      setGame(prev => ({ ...prev, status: GameStatus.GAME_OVER, score: newScore }));
    } else {
      setGame(prev => ({ 
        ...prev, 
        currentIndex: prev.currentIndex + 1, 
        score: newScore 
      }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-4 md:p-8">
      {/* Header */}
      <header className="w-full max-w-4xl flex justify-between items-center mb-12">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20">
            <span className="text-2xl">🧠</span>
          </div>
          <h1 className="text-2xl font-bungee tracking-wider neon-text">Trivia Master</h1>
        </div>
        {game.status === GameStatus.PLAYING && (
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs uppercase text-slate-500 font-bold">Score</p>
              <p className="text-xl font-bungee text-violet-400">{game.score}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase text-slate-500 font-bold">Progress</p>
              <p className="text-xl font-bungee text-emerald-400">{game.currentIndex + 1}/{game.questions.length}</p>
            </div>
          </div>
        )}
      </header>

      <main className="w-full max-w-4xl flex-1 flex flex-col items-center justify-center">
        {game.status === GameStatus.SETUP && (
          <div className="w-full space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center space-y-4">
              <h2 className="text-4xl md:text-6xl font-bungee mb-2">Select Your Host</h2>
              <p className="text-slate-400 text-lg">Who will guide you through the digital corridors of knowledge?</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {PERSONALITIES.map(p => (
                <button
                  key={p.id}
                  onClick={() => startGame(p)}
                  className="group relative bg-slate-900 border border-slate-800 p-6 rounded-3xl transition-all hover:scale-105 hover:border-violet-500/50 hover:bg-slate-800/50 text-left"
                >
                  <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">{p.icon}</div>
                  <h3 className="text-xl font-bold mb-2 group-hover:text-violet-400 transition-colors">{p.name}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{p.description}</p>
                  <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none" />
                </button>
              ))}
            </div>

            <div className="flex flex-col items-center gap-4">
              <label className="text-sm font-bold uppercase text-slate-500">Trivia Topic</label>
              <input 
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. 90s Pop Culture, Quantum Physics..."
                className="w-full max-w-md bg-slate-900 border border-slate-800 px-6 py-4 rounded-2xl text-center text-xl focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
              />
            </div>
          </div>
        )}

        {game.status === GameStatus.LOADING && (
          <div className="flex flex-col items-center gap-6 animate-pulse">
            <div className="relative">
              <div className="w-24 h-24 bg-violet-500 rounded-full blur-xl opacity-20 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              <div className="text-6xl">✨</div>
            </div>
            <p className="text-xl font-bungee text-violet-400 tracking-widest">Waking up the host...</p>
            <p className="text-slate-500">Generating fresh trivia using Google Search</p>
          </div>
        )}

        {game.status === GameStatus.PLAYING && (
          <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-8 items-start animate-in zoom-in-95 duration-500">
            {/* Host Section */}
            <div className="lg:col-span-1 space-y-6">
              <div className="glass p-8 rounded-3xl relative overflow-hidden flex flex-col items-center text-center">
                {isLiveActive && <div className="absolute top-4 right-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                  <span className="text-[10px] font-bold text-red-500 uppercase tracking-tighter">Live</span>
                </div>}
                
                <div className={`text-8xl mb-6 relative transition-transform duration-300 ${isLiveActive ? 'scale-110' : ''}`}>
                  {isLiveActive && <div className="absolute inset-0 bg-violet-500/20 blur-2xl rounded-full animate-pulse" />}
                  {game.personality?.icon}
                </div>
                
                <h3 className="text-2xl font-bungee text-violet-300">{game.personality?.name}</h3>
                <p className="text-slate-400 italic text-sm mt-2">"{game.personality?.description}"</p>

                <div className="mt-8 w-full">
                  <button
                    onClick={toggleLive}
                    className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all ${
                      isLiveActive 
                      ? 'bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500/20' 
                      : 'bg-violet-600 text-white hover:bg-violet-500 shadow-lg shadow-violet-600/30'
                    }`}
                  >
                    {isLiveActive ? (
                      <><span className="text-xl">🛑</span> End Conversation</>
                    ) : (
                      <><span className="text-xl">🎤</span> Talk to Host</>
                    )}
                  </button>
                  <p className="text-[10px] text-slate-500 mt-2 uppercase font-bold tracking-widest">Powered by Gemini 2.5 Live</p>
                </div>
              </div>
            </div>

            {/* Question Section */}
            <div className="lg:col-span-2 space-y-8">
              <div className="glass p-8 md:p-12 rounded-[2rem] space-y-8 min-h-[400px] flex flex-col justify-center">
                <div className="space-y-4">
                  <span className="px-4 py-1.5 bg-violet-500/10 text-violet-400 rounded-full text-xs font-bold uppercase tracking-widest">
                    {game.questions[game.currentIndex].category}
                  </span>
                  <h2 className="text-2xl md:text-3xl font-bold leading-tight">
                    {game.questions[game.currentIndex].question}
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {game.questions[game.currentIndex].options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => handleAnswer(opt)}
                      className="group flex items-center gap-4 bg-slate-900/50 border border-slate-800 p-6 rounded-2xl hover:border-violet-500/50 hover:bg-slate-800 transition-all text-left"
                    >
                      <span className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-slate-400 group-hover:bg-violet-500 group-hover:text-white transition-colors">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-lg font-medium">{opt}</span>
                    </button>
                  ))}
                </div>

                {game.questions[game.currentIndex].sourceUrl && (
                  <div className="pt-4 border-t border-slate-800">
                    <p className="text-xs text-slate-500 mb-2">Verified via Google Search</p>
                    <a 
                      href={game.questions[game.currentIndex].sourceUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-violet-400 hover:text-violet-300 text-xs flex items-center gap-1 transition-colors"
                    >
                      🔗 View Source Data
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {game.status === GameStatus.GAME_OVER && (
          <div className="text-center space-y-8 animate-in bounce-in duration-500">
            <div className="relative inline-block">
              <div className="text-8xl mb-4">🏆</div>
              <div className="absolute inset-0 bg-yellow-500/20 blur-3xl rounded-full" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-5xl font-bungee">Game Over!</h2>
              <p className="text-slate-400 text-xl">You've reached the end of the data stream.</p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 p-12 rounded-[3rem] inline-block min-w-[300px]">
              <p className="text-sm uppercase font-bold text-slate-500 mb-2 tracking-tighter">Final Score</p>
              <p className="text-7xl font-bungee text-violet-500">{game.score}</p>
            </div>

            <div>
              <button
                onClick={() => setGame(prev => ({ ...prev, status: GameStatus.SETUP }))}
                className="bg-white text-slate-950 px-12 py-4 rounded-2xl font-bold text-xl hover:bg-slate-200 transition-colors shadow-xl shadow-white/10"
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-12 text-slate-600 text-[10px] uppercase font-bold tracking-[0.2em]">
        Interactive AI Experience &bull; Powered by Google Gemini
      </footer>
    </div>
  );
};

export default App;
