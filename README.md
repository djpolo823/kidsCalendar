<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>
## Configuración para Hosting Externo

Si despliegas esta aplicación en un servicio como Vercel, Netlify o similar, debes configurar las siguientes Variables de Entorno (Environment Variables):

| Variable | Descripción |
| :--- | :--- |
| `VITE_SUPABASE_URL` | URL de tu proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Key anónima/pública de Supabase |
| `GEMINI_API_KEY` | Tu API Key de Google Gemini |
| `VITE_GOOGLE_CLIENT_ID` | (Opcional) ID de cliente para Google OAuth |

Consulta el archivo `.env.example` para ver un ejemplo de la estructura.
# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1VDsOtxnA0Wx-xldVAE5UlyOGq6BW2WOK

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
