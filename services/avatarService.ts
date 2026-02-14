/**
 * Avatar Service - Gestiona avatares para niños y usuarios
 * Usa APIs gratuitas y open source
 */

export type AvatarStyle = 
  | 'adventurer'      // Aventureros (estilo chibi)
  | 'avataaars'       // Estilo Pixar
  | 'big-smile'       // Sonrisas grandes
  | 'bottts'          // Robots
  | 'fun-emoji'       // Emojis divertidos
  | 'lorelei'         // Personajes femeninos
  | 'micah'           // Personajes diversos
  | 'pixel-art'       // Pixel art (estilo retro)
  | 'personas';       // Personas realistas

/**
 * Genera URL de avatar usando DiceBear API
 * @param seed - Identificador único (puede ser el ID del niño/usuario)
 * @param style - Estilo del avatar
 * @returns URL del avatar en formato SVG
 */
export function getAvatarUrl(seed: string, style: AvatarStyle = 'adventurer'): string {
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

/**
 * Estilos recomendados para niños (estilo chibi/kawaii)
 */
export const CHILD_AVATAR_STYLES: AvatarStyle[] = [
  'adventurer',   // Más parecido a chibi
  'big-smile',    // Sonrisas grandes, amigable
  'fun-emoji',    // Emojis divertidos
  'pixel-art',    // Retro gaming
];

/**
 * Genera un avatar aleatorio para un niño
 */
export function getRandomChildAvatar(childId: string): string {
  const randomStyle = CHILD_AVATAR_STYLES[
    Math.floor(Math.random() * CHILD_AVATAR_STYLES.length)
  ];
  return getAvatarUrl(childId, randomStyle);
}

/**
 * Genera múltiples opciones de avatar para que el usuario elija
 */
export function getAvatarOptions(seed: string, count: number = 6): string[] {
  const styles: AvatarStyle[] = ['adventurer', 'big-smile', 'fun-emoji', 'pixel-art', 'lorelei', 'micah'];
  return styles.slice(0, count).map(style => getAvatarUrl(seed, style));
}
