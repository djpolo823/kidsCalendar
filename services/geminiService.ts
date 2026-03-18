
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

let translationQueue = Promise.resolve();

export const translateText = async (text: string, targetLang: Language): Promise<string> => {
  if (!text || !text.trim()) return text;
  
  // 1. Check local cache to avoid redundant API hits across reloads
  const cacheKey = `trans_v2_${targetLang}_${text}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      console.log(`[Gemini] Cache hit for: "${text}" -> "${cached}"`);
      return cached;
    }
  } catch (e) {
    // Ignore localStorage errors
  }

  const tLang = targetLang === 'es' ? 'Spanish' : 'English';
  
  // 2. Add to sequential queue to avoid burst rate limits (429) when rendering many tasks
  return new Promise((resolve) => {
    translationQueue = translationQueue.then(async () => {
      console.log(`[Gemini] Translating: "${text}" to ${tLang}`);
      try {
        const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
          console.warn("[Gemini] No API Key found for translation");
          return resolve(text);
        }

        const ai = new GoogleGenAI({ apiKey });
        const response: any = await withRetry<any>(() => ai.models.generateContent({
          model: "gemini-1.5-flash",
          contents: [{ role: 'user', parts: [{ text: `Translate this text to ${tLang}. Respond ONLY with the direct translated text, without quotes, notes, or explanations. If it is already ${tLang}, return it exactly as is.\n\nText: ${text}` }] }],
        }));

        let translated = '';
        if (response.text) {
          translated = response.text;
        } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
          translated = response.candidates[0].content.parts[0].text;
        }

        translated = translated.trim();
        console.log(`[Gemini] Translation result: "${translated}"`);
        
        const finalResult = translated || text;
        
        // Only cache if we actually got a translation, preventing caching of invisible failures
        if (finalResult && finalResult !== text) {
          try { localStorage.setItem(cacheKey, finalResult); } catch (e) {}
        }
        
        // Wait briefly before next request to space them out
        await sleep(400); 
        resolve(finalResult);
      } catch (error) {
        console.error("[Gemini] Error translating text:", error);
        resolve(text);
      }
    });
  });
};

export const translateToBaseLanguage = async (text: string, baseLang: Language): Promise<string> => {
  if (!text || !text.trim()) return text;
  const tLang = baseLang === 'es' ? 'Spanish' : 'English';
  
  return new Promise((resolve) => {
    translationQueue = translationQueue.then(async () => {
      try {
        const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) return resolve(text);

        const ai = new GoogleGenAI({ apiKey });
        const response: any = await withRetry<any>(() => ai.models.generateContent({
          model: "gemini-1.5-flash",
          contents: [{ role: 'user', parts: [{ text: `Translate the following text to ${tLang}. Give ONLY the direct translation, nothing else. If the text is already in ${tLang}, simply return it exactly as it is. Do not wrap in quotes or add notes.\n\nText: ${text}` }] }],
        }));
        
        let translated = '';
        if (response.text) {
          translated = response.text;
        } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
          translated = response.candidates[0].content.parts[0].text;
        }

        await sleep(400);
        resolve(translated.trim() || text);
      } catch (error) {
        console.error("[Gemini] Error translating to base language:", error);
        resolve(text);
      }
    });
  });
};

export const getSpeechBase64 = async (text: string, lang: Language = 'en', voice: string = 'Kore'): Promise<string | null> => {
  try {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('PLACEHOLDER')) return null;

    const ai = new GoogleGenAI({ apiKey });
    const instruction = lang === 'es'
      ? `Dilo con tono alegre en ESPAÑOL: ${text}`
      : `Say with a friendly tone in ENGLISH: ${text}`;

    const response: any = await withRetry<any>(() => ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: 'user', parts: [{ text: instruction }] }],
      config: {
        responseModalities: ["AUDIO" as any], // Use string instead of enum to be safe with auto-gen SDK
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    }));

    // Safer extraction for different SDK versions
    let base64Audio = response.data; // Using the getter from Stainless SDK
    if (!base64Audio) {
      base64Audio = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
    }
    
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
  console.log(`[Gemini] Generating bulk tasks for: "${prompt}" in ${lang}`);
  try {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return [];

    const ai = new GoogleGenAI({ apiKey });
    const response: any = await withRetry<any>(() => ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: 'user', parts: [{ text: `Generate a list of 4-6 child tasks based on this description: "${prompt}". 
      IMPORTANT: You MUST provide titles and descriptions in ${lang === 'es' ? 'Spanish' : 'English'}.

      RULES FOR DESCRIPTIONS:
      1. MUST be SHORT and easy to understand for children (max 1 sentence, 10 to 15 words).
      2. DO NOT add greetings (e.g. "Hola", "Hello").
      3. DO NOT repeat the task title inside the description.
      4. DO NOT include duration, stars, rewards, or instructions to start.
      5. The description MUST be exclusively a brief motivational sentence validating why the task is good.
         Examples: 
         - "¡Buen comienzo! Empezar el día temprano te ayudará a tener un gran día."
         - "¡Excelente! Cuidar tus dientes los mantiene fuertes y saludables."
         - "¡Muy bien! Aprender cosas nuevas hace tu mente más fuerte."
      
      Return a JSON array of objects with properties: 
      - title
      - description
      - reward (number 5-50)
      - time (HH:MM AM/PM)
      - duration (minutes as number)
      - emoji
      - type (routine, school, activity, or hygiene).` }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY" as any,
          items: {
            type: "OBJECT" as any,
            properties: {
              title: { type: "STRING" as any },
              description: { type: "STRING" as any },
              reward: { type: "NUMBER" as any },
              time: { type: "STRING" as any },
              duration: { type: "NUMBER" as any },
              emoji: { type: "STRING" as any },
              type: { type: "STRING" as any }
            },
            required: ["title", "time", "emoji", "reward", "type"]
          }
        }
      }
    }));

    let jsonStr = '';
    if (response.text) {
      jsonStr = response.text;
    } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
      jsonStr = response.candidates[0].content.parts[0].text;
    }

    const result = JSON.parse(jsonStr || "[]");
    console.log(`[Gemini] Generated ${result.length} tasks with translations`);
    return result;
  } catch (error) {
    console.error("[Gemini] Error generating bulk tasks:", error);
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
        model: 'gemini-1.5-flash',
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
      model: 'gemini-1.5-flash',
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
