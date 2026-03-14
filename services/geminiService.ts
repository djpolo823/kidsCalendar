
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
  if (!text || !text.trim()) return text;
  const tLang = targetLang === 'es' ? 'Spanish' : 'English';
  console.log(`[Gemini] Translating: "${text}" to ${tLang}`);
  
  try {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("[Gemini] No API Key found for translation");
      return text;
    }

    const ai = new GoogleGenAI({ apiKey });
    const response: any = await withRetry<any>(() => ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: 'user', parts: [{ text: `Translate this text to ${tLang}. Respond ONLY with the translated text, no quotes or explanations.\n\nText: ${text}` }] }],
    }));
    
    // Log the whole response for debugging if needed (redacted key info)
    console.log("[Gemini] Response structure:", JSON.stringify(response).substring(0, 500));

    let translated = '';
    if (response.text) {
      translated = response.text;
    } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
      translated = response.candidates[0].content.parts[0].text;
    }

    translated = translated.trim();
    console.log(`[Gemini] Translation result: "${translated}"`);
    return translated || text;
  } catch (error) {
    console.error("[Gemini] Error translating text:", error);
    return text;
  }
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
      IMPORTANT: You MUST provide titles and descriptions in BOTH Spanish and English.
      
      Return a JSON array of objects with properties: 
      - title (original)
      - description (original)
      - title_es (Spanish translation)
      - title_en (English translation)
      - description_es (Spanish translation)
      - description_en (English translation)
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
              title_es: { type: "STRING" as any },
              title_en: { type: "STRING" as any },
              description_es: { type: "STRING" as any },
              description_en: { type: "STRING" as any },
              reward: { type: "NUMBER" as any },
              time: { type: "STRING" as any },
              duration: { type: "NUMBER" as any },
              emoji: { type: "STRING" as any },
              type: { type: "STRING" as any }
            },
            required: ["title", "title_es", "title_en", "time", "emoji", "reward", "type"]
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
