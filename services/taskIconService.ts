/**
 * Task Icon Service - Gestiona iconos para tareas
 * Usa emojis y bibliotecas gratuitas
 */

export type TaskCategory =
    | 'homework'
    | 'chores'
    | 'hygiene'
    | 'sports'
    | 'reading'
    | 'music'
    | 'art'
    | 'gaming'
    | 'sleep'
    | 'food'
    | 'other';

/**
 * Mapeo de categorías a emojis
 */
export const TASK_EMOJIS: Record<TaskCategory, string> = {
    homework: '📚',
    chores: '🧹',
    hygiene: '🛁',
    sports: '⚽',
    reading: '📖',
    music: '🎵',
    art: '🎨',
    gaming: '🎮',
    sleep: '😴',
    food: '🍽️',
    other: '⭐',
};

/**
 * Obtiene el emoji para una categoría de tarea
 */
export function getTaskEmoji(category: TaskCategory): string {
    return TASK_EMOJIS[category] || TASK_EMOJIS.other;
}

/**
 * Convierte emoji a código Unicode para URLs
 */
function emojiToUnicode(emoji: string): string {
    return emoji.codePointAt(0)?.toString(16).padStart(4, '0') || '';
}

/**
 * Obtiene URL de emoji en formato SVG usando Twemoji (Twitter)
 * @param emoji - El emoji a convertir
 * @returns URL del SVG del emoji
 */
export function getEmojiSvgUrl(emoji: string): string {
    const code = emojiToUnicode(emoji);
    return `https://cdn.jsdelivr.net/npm/twemoji@latest/assets/svg/${code}.svg`;
}

/**
 * Obtiene URL de emoji SVG para una categoría de tarea
 */
export function getTaskIconUrl(category: TaskCategory): string {
    const emoji = getTaskEmoji(category);
    return getEmojiSvgUrl(emoji);
}

/**
 * Lista de emojis populares para tareas infantiles
 */
export const POPULAR_TASK_EMOJIS = [
    '⭐', '🌟', '✨', '🎯', '🏆', '🎁', '🎈', '🎉',
    '📚', '✏️', '📝', '🎨', '🖍️', '✂️', '📐', '🔬',
    '🧹', '🧺', '🧼', '🧽', '🗑️', '🛏️', '🪴', '🐕',
    '🛁', '🚿', '🪥', '🧴', '💇', '👕', '👟', '🧦',
    '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏓', '🏸',
    '🎮', '🎲', '🧩', '🎯', '🎪', '🎭', '🎬', '📺',
    '🍎', '🥗', '🥛', '🍽️', '🥄', '🍳', '🥪', '🍕',
    '😴', '🛌', '🌙', '⏰', '🌅', '🌄', '☀️', '🌈',
];

/**
 * Obtiene un emoji aleatorio de la lista popular
 */
export function getRandomTaskEmoji(): string {
    return POPULAR_TASK_EMOJIS[
        Math.floor(Math.random() * POPULAR_TASK_EMOJIS.length)
    ];
}
