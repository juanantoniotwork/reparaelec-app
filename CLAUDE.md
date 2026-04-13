# Reparaelec App — Panel Técnico (iPad)

## Descripción
App nativa para iPad para técnicos de electrodomésticos.
Permite consultar manuales técnicos mediante chat con IA (RAG).
Es el panel técnico de Reparaelec — el panel admin se gestiona desde la web.

## Stack
- React Native + Expo (TypeScript)
- React Navigation para navegación
- Zustand para estado global
- expo-secure-store para el token de autenticación

## API
- Base URL PRE: `https://api.reparaelec.servidortigres.com/api`
- Autenticación: Bearer token (Laravel Sanctum)
- El token se guarda en SecureStore con la clave `token`

## Credenciales de prueba
- Técnico: `tecnico@reparaelec.com` / `password123`

## Pantallas
1. **Login** — autenticación con email y contraseña
2. **Chat** — chat con streaming SSE, filtro por categoría
3. **Historial** — listado de conversaciones anteriores

## Estructura de carpetas