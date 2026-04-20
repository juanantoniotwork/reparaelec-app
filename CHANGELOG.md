# Reparaelec App — Historial de desarrollo

Panel técnico para iPad destinado a técnicos de electrodomésticos.
Permite consultar manuales técnicos mediante un chat con IA (RAG).

**Stack:** React Native 0.81 + Expo 54 + TypeScript  
**API:** Laravel Sanctum (`https://api.reparaelec.servidortigres.com/api`)

---

## Funcionalidades implementadas

### Auth

- Login con email y contraseña contra `/api/login` (Laravel Sanctum)
- Token almacenado en `expo-secure-store`
- Logout con eliminación de token y redirección a Login
- Validación de campos vacíos antes de enviar

### Chat

- Streaming de respuestas vía SSE (`XMLHttpRequest` + `onprogress`) contra `/api/chat/stream`
- Renderizado de Markdown en las respuestas del asistente (`react-native-markdown-display`)
- Cursor animado (`▍`) mientras se espera la primera respuesta
- Filtro por categorías de documentación (chips horizontales con scroll); "Todos" omite `category_ids` del payload
- Modo avanzado (flag `advanced: true` en el payload), accesible desde un popover con switch sobre el botón `+`
- Sugerencias de preguntas frecuentes cargadas desde `/api/chat/suggestions`, con estado de carga, error y reintento
- Copiar respuesta al portapapeles con toast animado
- Feedback positivo/negativo por interacción (`POST /api/interactions/:id/feedback`), con rollback optimista en caso de error
- Botón flotante "Nuevo chat" para reiniciar la sesión
- Continuación de conversaciones previas pasando `session_id` al endpoint de chat
- `KeyboardAvoidingView` con spacer condicional de safe area (se oculta al abrir el teclado para evitar hueco extra)

### Historial

- Listado de interacciones desde `/api/interactions` con pull-to-refresh
- Eliminación de sesiones con confirmación (`DELETE /api/sessions/:id`)
- Pantalla de detalle de sesión: muestra la conversación completa con burbujas usuario/asistente y Markdown
- Botón "Continuar conversación" que navega de vuelta al Chat con el `sessionId`
- Estados de carga, error con reintento, y lista vacía

### UI/UX

- Tema claro y oscuro con persistencia en `AsyncStorage`
- `ThemeContext` global con hook `useTheme()` disponible en todas las pantallas
- Paleta de colores centralizada en `src/theme.ts` (light/dark)
- Toggle de tema accesible desde Login, Chat, Historial y Detalle de sesión
- Safe area handling con `react-native-safe-area-context`
- Navegación con `@react-navigation/native-stack`, sin headers nativos (custom headers en cada pantalla)

### Build & Deploy

- Configuración EAS (`eas.json`) con perfiles `development`, `preview` y `production`
- Auto-increment de versión en builds de producción
- `expo-updates` integrado para actualizaciones OTA

---

## Historial de commits

| Fecha | Hash | Descripción |
|---|---|---|
| 2026-04-09 | `552d622` | Scaffold inicial del proyecto Expo |
| 2026-04-13 | `c907f7b` | Login, chat con streaming SSE, historial, renderizado Markdown |
| 2026-04-20 | `d70ce8c` | Fix de feedback y padding del teclado |

### Cambios no commiteados (2026-04-20)

- **Popover de modo avanzado:** el botón del rayo se reemplazó por un botón `+` que abre un popover in-tree (sin `Modal`) con un switch para activar/desactivar el modo avanzado. Funciona correctamente con el teclado abierto.
- **Fix del teclado:** el spacer de safe area inferior se oculta cuando el teclado está visible para eliminar el hueco entre el input y el teclado.

---

## Pendiente

### Funcional

- **Sesión persistente:** la app no comprueba si hay un token válido al arrancar; siempre empieza en Login
- **Gestión de sesiones en el chat:** el `session_id` devuelto por el backend en la primera interacción no se guarda en el estado, por lo que mensajes sucesivos en la misma sesión nueva pueden no agruparse correctamente
- **Error en tipado de HistoryScreen:** `item.session_id` puede ser `undefined` pero se pasa a `deleteSession(id: number)` sin comprobación (error TS2345 activo)
- **Paginación:** ni el historial ni las interacciones de una sesión tienen paginación; con volumen alto de datos puede haber problemas de rendimiento

### UI/UX

- **Feedback visual del popover:** no hay animación de entrada/salida en el popover del modo avanzado
- **Scroll automático:** `onContentSizeChange` hace scroll al final en cada render, no solo al recibir mensajes nuevos
- **Accesibilidad:** no hay `accessibilityLabel` ni `accessibilityRole` en los elementos interactivos

### Técnico

- **Manejo de errores en SSE:** si la conexión se corta a mitad de un stream, el mensaje parcial queda visible sin indicación de error
- **Cancelación de streaming:** no hay botón para cancelar una respuesta en curso (el `xhrRef` está preparado pero no se usa desde la UI)
- **Tests:** no hay tests unitarios ni de integración
- **CI/CD:** no hay pipeline de CI configurado
