
import { GoogleGenAI, Modality, GenerateContentResponse, Type } from "@google/genai";
import { Language, Task } from "../types";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000; // 1 second

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper to wrap API calls with exponential backoff retry logic.
 * Handles 429 (Resource Exhausted) errors gracefully.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isRateLimit = error?.message?.includes('429') || error?.status === 429 || error?.message?.includes('quota');

      if (isRateLimit && i < retries) {
        const backoff = INITIAL_BACKOFF * Math.pow(2, i);
        console.warn(`Gemini API rate limit reached. Retrying in ${backoff}ms... (Attempt ${i + 1}/${retries})`);
        await sleep(backoff);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

const decodeBase64 = (base64: string) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const decodeAudioData = async (
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number
): Promise<AudioBuffer> => {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
};

/**
 * Fallback to browser's native Speech Synthesis if Gemini TTS fails.
 */
const speakWithBrowserFallback = (text: string, lang: Language) => {
  return new Promise<void>((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'es' ? 'es-ES' : 'en-US';
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
};

export const translateText = async (text: string, targetLang: Language): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    // Fix: Explicitly type response as GenerateContentResponse to avoid 'unknown' errors when using withRetry wrapper
    const response: GenerateContentResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Translate the following text to ${targetLang === 'es' ? 'Spanish' : 'English'}: "${text}". Respond only with the translated text.`,
    }));
    return response.text?.trim() || text;
  } catch (error) {
    console.error("Error translating text:", error);
    return text;
  }
};

export const getSpeechBase64 = async (text: string, lang: Language = 'en', voice: string = 'Kore'): Promise<string | null> => {
  try {
    const apiKey = process.env.API_KEY as string;
    if (!apiKey || apiKey.includes('PLACEHOLDER')) return null;

    const ai = new GoogleGenAI({ apiKey });
    const instruction = lang === 'es'
      ? `Dilo con tono alegre en ESPAÑOL: ${text}`
      : `Say with a friendly tone in ENGLISH: ${text}`;

    const response: GenerateContentResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: instruction }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    }));

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return typeof base64Audio === 'string' ? base64Audio : null;
  } catch (error) {
    console.error("Error getting speech base64:", error);
    return null;
  }
};

export const playAudioFromBase64 = async (base64Audio: string): Promise<void> => {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const decodedBytes = decodeBase64(base64Audio);
  const audioBuffer = await decodeAudioData(decodedBytes, audioCtx, 24000, 1);

  return new Promise<void>((resolve) => {
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.onended = () => {
      resolve();
      audioCtx.close();
    };
    source.start();
  });
};

export const generateSpeech = async (text: string, lang: Language = 'en', voice: string = 'Kore') => {
  try {
    const apiKey = process.env.API_KEY as string;

    // Immediate fallback if no valid key provided
    if (!apiKey || apiKey.includes('PLACEHOLDER')) {
      console.warn("Using browser fallback due to missing Gemini API key");
      return speakWithBrowserFallback(text, lang);
    }

    const base64Audio = await getSpeechBase64(text, lang, voice);
    if (base64Audio) {
      return playAudioFromBase64(base64Audio);
    }

    console.warn("Gemini TTS returned no data, falling back to browser speech.");
    return speakWithBrowserFallback(text, lang);
  } catch (error: any) {
    console.warn("Gemini TTS failed, falling back to browser speech.", error?.message || String(error));
    return speakWithBrowserFallback(text, lang);
  }
};

export const generateBulkTasks = async (prompt: string, lang: Language): Promise<Partial<Task>[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    // Fix: Explicitly type response as GenerateContentResponse and provide generic to withRetry to ensure .text property access is valid
    const response: GenerateContentResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a list of 4-6 child tasks based on this description: "${prompt}". 
      Language: ${lang === 'es' ? 'Spanish' : 'English'}.
      Return a JSON array of objects with properties: title, description, reward (a number between 5 and 50 representing stars to earn), time (HH:MM AM/PM format), duration (minutes as string), emoji, type (routine, school, activity, or hygiene).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              reward: { type: Type.NUMBER },
              time: { type: Type.STRING },
              duration: { type: Type.STRING },
              emoji: { type: Type.STRING },
              type: { type: Type.STRING }
            },
            required: ["title", "time", "emoji", "reward", "type"]
          }
        }
      }
    }));

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Error generating bulk tasks:", error);
    return [];
  }
};

export const generateAvatars = async (userPrompt: string): Promise<string[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    const fullPrompt = `A cute, high-quality, 3D animated character style avatar for a child's profile. Subject: ${userPrompt}. Flat pastel background, close-up portrait, child-friendly, adorable.`;

    // Fix: Explicitly type withRetry generic to GenerateContentResponse
    const requests = Array.from({ length: 4 }).map(() =>
      withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: fullPrompt }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
      }))
    );

    const responses = await Promise.all(requests);
    const images: string[] = [];

    responses.forEach((response: GenerateContentResponse) => {
      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data && part.inlineData?.mimeType) {
          images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
        }
      }
    });

    return images;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error generating avatars:", msg);
    throw error;
  }
};

export const suggestEmoji = async (title: string, description: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    // Fix: Explicitly type response and withRetry generic as GenerateContentResponse to fix 'unknown' type error
    const response: GenerateContentResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Suggest a single emoji that best represents this task for a kid's calendar.
      Title: "${title}"
      Description: "${description}"
      Respond ONLY with the single emoji character.`,
    }));

    const responseText = response.text;
    const cleanText = (typeof responseText === 'string' ? responseText : '🌟').trim();
    return Array.from(cleanText)[0] || '🌟';
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Error suggesting emoji:", errorMsg);
    return '🌟';
  }
};

export interface RewardSuggestion {
  title: string;
  category: string;
  cost: number;
  type: 'screen' | 'toy' | 'treat';
  reason: string;
  emoji: string;
}

export const generateRewardSuggestions = async (
  childName: string,
  age: number,
  loveLanguages: string[],
  language: Language
): Promise<RewardSuggestion[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    const prompt = `Generate 3 creative and varied reward ideas for a ${age}-year-old child named ${childName}.
    The child's love languages are: ${loveLanguages.join(', ')}.
    
    Requirements:
    - Recommendations must reflect the love languages (e.g. if 'Quality Time', suggest an activity together).
    - Provide a 'reason' explaining how it connects to their love language.
    - Costs should be between 10 and 100 stars.
    - Language: ${language === 'es' ? 'Spanish' : 'English'}.
    
    Return a JSON array of 3 objects with:
    - title: short reward name
    - category: e.g. "Experience", "Physical", "Special Treat"
    - cost: number of stars
    - type: one of "screen", "toy", "treat"
    - reason: short explanation for the parent
    - emoji: a single representative emoji`;

    const response: GenerateContentResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              category: { type: Type.STRING },
              cost: { type: Type.NUMBER },
              type: { type: Type.STRING, enum: ["screen", "toy", "treat"] },
              reason: { type: Type.STRING },
              emoji: { type: Type.STRING }
            },
            required: ["title", "category", "cost", "type", "reason", "emoji"]
          }
        }
      }
    }));

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Error generating reward suggestions:", error);
    return [];
  }
};
