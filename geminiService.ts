
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { TriviaQuestion, Personality } from './types';

const apiKey = process.env.API_KEY || '';

export const generateTriviaBatch = async (topic: string): Promise<TriviaQuestion[]> => {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Generate 5 high-quality trivia questions about ${topic}. Use Google Search to ensure they are accurate and include interesting recent facts if possible. Include one "impossible" question based on a very recent event.`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswer: { type: Type.STRING },
            explanation: { type: Type.STRING },
            category: { type: Type.STRING },
            sourceUrl: { type: Type.STRING, description: 'URL to the source of the fact' }
          },
          required: ["question", "options", "correctAnswer", "explanation", "category"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || '[]');
  } catch (e) {
    console.error("Failed to parse trivia response", e);
    return [];
  }
};

export const generateTTS = async (text: string, voice: string = 'Kore'): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
};

export const connectLiveHost = async (
  personality: Personality,
  gameState: any,
  callbacks: {
    onAudio: (base64: string) => void;
    onInterrupted: () => void;
  }
) => {
  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = `${personality.systemPrompt}
  You are hosting a trivia game.
  The current game state is: ${JSON.stringify(gameState)}.
  Interact with the user naturally via voice. 
  When they answer, congratulate or commiserate them, then move to the next question if they are ready.
  Keep responses concise and character-driven.`;

  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks: {
      onopen: () => console.log('Live host session opened'),
      onmessage: async (message) => {
        const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
        if (audio) callbacks.onAudio(audio);
        if (message.serverContent?.interrupted) callbacks.onInterrupted();
      },
      onerror: (e) => console.error('Live session error', e),
      onclose: () => console.log('Live host session closed'),
    },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: personality.voice } }
      },
      systemInstruction
    }
  });
};
