# Reparaelec App 📱

> Cliente móvil de **Reparaelec** — plataforma RAG con IA que permite a técnicos de electrodomésticos consultar manuales técnicos mediante chat conversacional.

---

## Descripción

Reparaelec App es la aplicación React Native / Expo que acompaña a la plataforma Reparaelec. Los técnicos pueden hacer preguntas en lenguaje natural desde el campo y recibir respuestas fundamentadas en la documentación técnica real del electrodoméstico que están reparando — sin buscar manualmente en PDFs.

La app se comunica con el backend Laravel [reparaelec-api](https://git.trestristestigres.es/reparaelec/reparaelec-api), que gestiona la recuperación RAG mediante embeddings con Ollama y transmite las respuestas en streaming usando la API de Claude (Anthropic).

---

## Funcionalidades

- 🔐 **Autenticación segura** — login con email/contraseña y token almacenado en `expo-secure-store`
- 💬 **Chat en streaming** — respuestas en tiempo real vía SSE renderizadas con soporte Markdown
- 📂 **Filtrado por categoría** — acota las consultas a categorías de electrodomésticos específicas
- ⚡ **Modo avanzado** — alterna entre modelo estándar (Haiku) y avanzado (Sonnet)
- 🕘 **Historial de conversaciones** — consulta sesiones anteriores y retoma conversaciones
- 👍👎 **Feedback en respuestas** — valora las respuestas para mejorar el sistema *(en desarrollo)*
- 🌙 **Modo oscuro** — toggle manual con preferencia persistente vía AsyncStorage
- 🔄 **Actualizaciones OTA** — actualizaciones en vivo con EAS Update sin necesidad de recompilar

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | React Native + Expo SDK 54 |
| Lenguaje | TypeScript |
| Navegación | React Navigation |
| Almacenamiento seguro | expo-secure-store |
| Renderizado Markdown | react-native-markdown-display |
| Iconos | @expo/vector-icons |
| Actualizaciones OTA | expo-updates / EAS Update |
| Build y despliegue | EAS Build |

---

## Estructura del proyecto

```
reparaelec-app/
├── src/
│   ├── screens/
│   │   ├── LoginScreen.tsx          # Pantalla de autenticación
│   │   ├── ChatScreen.tsx           # Chat principal + streaming SSE
│   │   ├── HistoryScreen.tsx        # Listado de sesiones anteriores
│   │   └── SessionDetailScreen.tsx  # Detalle de sesión + reanudar
│   ├── services/
│   │   └── api.ts                   # Centraliza todas las llamadas a la API
│   └── theme.ts                     # Colores claro/oscuro + hook useTheme()
├── app.json
├── eas.json
└── package.json
```

---

## Primeros pasos

### Requisitos previos

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)
- Acceso a la API de Reparaelec (ver [reparaelec-api](https://git.trestristestigres.es/reparaelec/reparaelec-api))

### Instalación

```bash
git clone https://github.com/juanann99/reparaelec-app.git
cd reparaelec-app
npm install
```

### Variables de entorno

Crea un archivo `.env` (o configura vía `app.config.js`) apuntando a la API:

```
API_BASE_URL=https://api.reparaelec.servidortigres.com
```

### Arrancar en local

```bash
npx expo start
```

Escanea el código QR con **Expo Go** (Android/iOS) o ejecútalo en un simulador.

---

## Build y despliegue

### Actualización OTA (sin recompilar)

```bash
eas update --branch preview --message "Descripción breve del cambio"
```

### APK Android (preview)

```bash
eas build --platform android --profile preview
```

### iOS (TestFlight)

```bash
eas build --platform ios
```

> **Nota:** La build de iOS requiere una cuenta de Apple Developer activa configurada en `eas.json`.

---

## Referencia de la API

La app consume los siguientes endpoints de `reparaelec-api`:

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/api/login` | Autenticación y obtención de token |
| `POST` | `/api/logout` | Cierre de sesión |
| `POST` | `/api/chat/stream` | Chat en streaming SSE (campo `chunk`) |
| `GET` | `/api/categories` | Categorías de electrodomésticos disponibles |
| `GET` | `/api/chat/suggestions` | Sugerencias de preguntas |
| `GET` | `/api/interactions` | Historial de conversaciones |
| `DELETE` | `/api/sessions/{session_id}` | Eliminar una sesión |
| `POST` | `/api/interactions/{id}/feedback` | Enviar feedback 👍👎 |

Payload del chat en streaming:

```json
{
  "question": "¿Cómo se limpia el filtro de una Bosch Serie 6?",
  "category_ids": [2],
  "advanced": false,
  "session_id": "uuid-opcional-para-continuar-sesión"
}
```

---

## Pendiente

- [ ] UI de feedback 👍👎 en las respuestas del chat
- [ ] Ajuste de padding/teclado en Android (sin barra de gestos) e iOS (`KeyboardAvoidingView`)
- [ ] Publicación en TestFlight (iOS)
- [ ] Notificaciones push para consultas de larga duración

---

## Repositorios relacionados

| Repo | Descripción |
|---|---|
| [reparaelec-api](https://git.trestristestigres.es/reparaelec/reparaelec-api) | Backend Laravel 11 — pipeline RAG, API Claude, SSE |
| [reparaelec-admin](https://git.trestristestigres.es/reparaelec/reparaelec-admin) | Panel de administración Next.js 14 — gestión de documentos, usuarios y analítica |

---

## Sobre el proyecto

Reparaelec es un proyecto portfolio de **[Tres Tristes Tigres](https://trestristestigres.es)** — agencia digital con 25 años de experiencia desarrollando productos web y móvil.

El proyecto demuestra una arquitectura RAG en producción: ingesta de PDFs → embeddings vectoriales (Ollama `nomic-embed-text`) → recuperación por similitud coseno → streaming con la API de Claude — todo accesible desde una aplicación móvil nativa.

---

*Desarrollado con React Native + Expo · Impulsado por la API de Claude (Anthropic)*
