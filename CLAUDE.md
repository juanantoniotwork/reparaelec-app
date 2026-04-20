# Reparaelec App — Panel Técnico

## Descripcion
App React Native / Expo para técnicos de electrodomésticos (Android e iOS).
Permite consultar manuales técnicos mediante chat con IA (RAG con embeddings + Claude).
Es el panel técnico de Reparaelec — el panel admin se gestiona desde la web (Next.js).

## Stack
- React Native 0.81 + Expo SDK 54 (TypeScript)
- React Navigation (`@react-navigation/native-stack`) para navegación
- `ThemeContext` con `useTheme()` para estado global del tema (claro/oscuro), persistido en `AsyncStorage`
- `expo-secure-store` para el token de autenticación
- `react-native-safe-area-context` para safe areas
- `react-native-markdown-display` para renderizar Markdown en respuestas
- `expo-updates` + EAS Build para actualizaciones OTA y builds

## API
- Base URL PRE: `https://api.reparaelec.servidortigres.com/api`
- Autenticación: Bearer token (Laravel Sanctum)
- El token se guarda en SecureStore con la clave `token`

## Credenciales de prueba
- Técnico: `tecnico@reparaelec.com` / `password`

## Pantallas
1. **Login** (`LoginScreen.tsx`) — autenticación con email y contraseña
2. **Chat** (`ChatScreen.tsx`) — chat con streaming SSE, filtro por categoría, modo avanzado, feedback, sugerencias
3. **Historial** (`HistoryScreen.tsx`) — listado de sesiones anteriores con pull-to-refresh y eliminación
4. **SessionDetail** (`SessionDetailScreen.tsx`) — detalle de una conversación con botón "Continuar conversación"

## Estructura de carpetas
```
src/
  screens/          # Las 4 pantallas de la app
  services/api.ts   # Todas las llamadas a la API centralizadas
  theme.ts          # Paletas de colores (lightColors / darkColors)
  ThemeContext.tsx   # Provider + hook useTheme()
App.tsx             # Navigator con RootStackParamList
```

## Comandos útiles
```bash
npx expo start                                    # Dev server
eas update --branch preview --message "..."        # OTA update
eas build --platform android --profile preview     # APK preview
eas build --platform ios                           # iOS (requiere Apple Developer)
npx tsc --noEmit                                   # Type-check
```

## Convenciones

### api.ts
Todas las llamadas HTTP están en `src/services/api.ts`. Cada función exportada corresponde a un endpoint.
`safeFetch` envuelve `fetch` para capturar errores de red. `authHeaders()` inyecta el Bearer token.
El chat usa `buildChatStreamXhr()` que devuelve un `XMLHttpRequest` configurado + función `send()` para que el caller registre `onprogress`/`onload`/`onerror` antes de disparar.

### SSE (streaming)
El chat usa SSE sobre `XMLHttpRequest` (no `EventSource`). En `onprogress` se parsean las líneas `data:` incrementalmente.
Cada chunk es un JSON con `{ chunk: string, interaction_id?: number }`. El stream termina con `data: [DONE]`.

### Tema claro/oscuro
`ThemeContext.tsx` expone `ThemeProvider` y `useTheme()` que retorna `{ isDark, toggleTheme, colors }`.
La preferencia se persiste en `AsyncStorage` con la clave `darkMode`.
Los colores se definen en `theme.ts` (`lightColors` / `darkColors`) y se usan en `makeStyles(colors)` en cada pantalla.
