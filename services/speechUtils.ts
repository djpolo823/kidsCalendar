
import { Task, Language } from '../types';
import { t } from './i18n';

export const getTaskSpeechText = (task: Task, childName: string, language: Language): string => {
    const durationText = task.duration && task.duration !== '0'
        ? (language === 'es' ? `Dura ${task.duration} minutos.` : `It takes ${task.duration} minutes.`)
        : '';

    if (task.status === 'active') {
        return language === 'es'
            ? `¡Hola ${childName}! ¡Vas muy bien! Tu tarea actual es: ${task.title}. ${durationText} ${task.description ? `Recuerda: ${task.description}.` : ''} ¡Ánimo, ganarás ${task.reward} estrellas!`
            : `Hello ${childName}! You're doing great! Your current task is: ${task.title}. ${durationText} ${task.description ? `Remember: ${task.description}.` : ''} Keep it up, you'll earn ${task.reward} stars!`;
    } else if (task.status === 'pending') {
        return language === 'es'
            ? `¡Hola ${childName}! Lo siguiente en tu día es: ${task.title}. ${durationText} ${task.description ? `Trata de: ${task.description}.` : ''} ¡Podrás ganar ${task.reward} estrellas! Avísame cuando estés listo para empezar.`
            : `Hi ${childName}! Next up in your day is: ${task.title}. ${durationText} ${task.description ? `It is about: ${task.description}.` : ''} You can earn ${task.reward} stars! Let me know when you are ready to start.`;
    } else {
        return language === 'es'
            ? `¡Bravo ${childName}! Has completado ${task.title}. ¡Eres increíble!`
            : `Way to go ${childName}! You finished ${task.title}. You are awesome!`;
    }
};

export const cleanForSpeech = (str: string) =>
    str.replace(/[^\p{L}\p{N}\p{P}\s]/gu, '').replace(/\s+/g, ' ').trim();
