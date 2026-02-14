# 🎨 Guía de Avatares e Iconos - KidsCalendar

## 📋 Resumen

Esta app usa **APIs gratuitas y open source** para avatares e iconos, evitando problemas de licencias y costos.

## 🧒 Avatares para Niños

### DiceBear API (Gratuito, Open Source)

**Estilos disponibles** (similares a chibi/kawaii):

1. **`adventurer`** ⭐ Recomendado - Estilo aventurero/chibi
2. **`big-smile`** - Sonrisas grandes, muy amigable
3. **`fun-emoji`** - Emojis divertidos
4. **`pixel-art`** - Estilo retro gaming
5. **`lorelei`** - Personajes femeninos
6. **`micah`** - Personajes diversos

### Uso en el Código

```typescript
import { getAvatarUrl, getAvatarOptions } from './services/avatarService';

// Avatar único basado en ID
const avatarUrl = getAvatarUrl(childId, 'adventurer');

// Múltiples opciones para que el usuario elija
const options = getAvatarOptions(childId, 6);
```

### Ejemplo de URLs Generadas

```
https://api.dicebear.com/7.x/adventurer/svg?seed=child123
https://api.dicebear.com/7.x/big-smile/svg?seed=child123
https://api.dicebear.com/7.x/pixel-art/svg?seed=child123
```

## ✨ Iconos para Tareas

### Twemoji (Twitter Emojis - Gratuito)

Usamos emojis de Twitter en formato SVG de alta calidad.

### Categorías Disponibles

| Categoría | Emoji | Descripción |
|-----------|-------|-------------|
| `homework` | 📚 | Tareas escolares |
| `chores` | 🧹 | Quehaceres domésticos |
| `hygiene` | 🛁 | Higiene personal |
| `sports` | ⚽ | Deportes y ejercicio |
| `reading` | 📖 | Lectura |
| `music` | 🎵 | Música |
| `art` | 🎨 | Arte y creatividad |
| `gaming` | 🎮 | Videojuegos |
| `sleep` | 😴 | Dormir |
| `food` | 🍽️ | Comida |

### Uso en el Código

```typescript
import { getTaskEmoji, getTaskIconUrl } from './services/taskIconService';

// Obtener emoji como texto
const emoji = getTaskEmoji('homework'); // "📚"

// Obtener URL del SVG
const iconUrl = getTaskIconUrl('homework');
// https://cdn.jsdelivr.net/npm/twemoji@latest/assets/svg/1f4da.svg
```

## 🎯 Ventajas de Esta Solución

✅ **Gratuito** - No requiere licencias de pago
✅ **Sin límites de API** - Uso ilimitado
✅ **Open Source** - Código abierto
✅ **Alta calidad** - SVG escalables
✅ **Sin atribución requerida** - Para DiceBear y Twemoji
✅ **CDN rápido** - Carga instantánea
✅ **Offline-friendly** - Puedes descargar y hospedar localmente si quieres

## 🚀 Alternativas Futuras

Si en el futuro quieres usar ilustraciones premium de IconScout:

1. **Comprar licencia** en IconScout
2. **Descargar manualmente** las ilustraciones
3. **Hospedar en Supabase Storage**:
   ```typescript
   const { data } = await supabase.storage
     .from('avatars')
     .upload(`child-${id}.svg`, file);
   ```

## 📚 Recursos

- [DiceBear API](https://www.dicebear.com/)
- [Twemoji](https://twemoji.twitter.com/)
- [OpenMoji](https://openmoji.org/) - Alternativa adicional
- [Supabase Storage](https://supabase.com/docs/guides/storage) - Para hospedar tus propias imágenes

---

**Nota**: IconScout requiere licencia de pago y no tiene API pública. Las soluciones aquí propuestas son legales, gratuitas y de alta calidad.
