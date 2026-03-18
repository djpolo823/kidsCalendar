
import { Task, Language } from '../types';
import { t } from './i18n';

export const getTaskSpeechText = (task: Task, childName: string, language: Language): string => {
    if (task.status === 'done') {
        return language === 'es'
            ? `¡Completaste: ${task.title}! ¡Genial!`
            : `You completed: ${task.title}! Awesome!`;
    }

    // Just strictly the title and description, as the UI already shows all other metrics.
    // Removes the robotic "Hola Ian David", duration, stars, and instructions.
    const parts = [task.title];
    if (task.description) {
        parts.push(task.description);
    }
    return parts.join('. ');
};

export const cleanForSpeech = (str: string) =>
    str.replace(/[^\p{L}\p{N}\p{P}\s]/gu, '').replace(/\s+/g, ' ').trim();
