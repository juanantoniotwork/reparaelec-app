import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Markdown from 'react-native-markdown-display';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Chat'>;
  route: RouteProp<RootStackParamList, 'Chat'>;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type Category = {
  id: string | number;
  name: string;
};

type Suggestion = {
  query: string;
  hit_count: number;
};

const API = 'https://api.reparaelec.servidortigres.com/api';
const ALL_CATEGORY = { id: 'all', name: 'Todos' };

export default function ChatScreen({ navigation, route }: Props) {
  const sessionId = route?.params?.sessionId ?? null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const [categories, setCategories] = useState<Category[]>([ALL_CATEGORY]);
  const [selectedCategory, setSelectedCategory] = useState<string | number>('all');

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  // ── Carga inicial ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadInitialData() {
      const token = await SecureStore.getItemAsync('token');
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      };

      const [catRes, sugRes] = await Promise.allSettled([
        fetch(`${API}/categories`, { headers }),
        fetch(`${API}/chat/suggestions`, { headers }),
      ]);

      if (catRes.status === 'fulfilled' && catRes.value.ok) {
        const data = await catRes.value.json();
        const list: Category[] = Array.isArray(data) ? data : data.data ?? [];
        setCategories([ALL_CATEGORY, ...list]);
      }

      if (sugRes.status === 'fulfilled' && sugRes.value.ok) {
        const data = await sugRes.value.json();
        const list: Suggestion[] = Array.isArray(data) ? data : data.data ?? [];
        setSuggestions(list);
      }

      setLoadingSuggestions(false);
    }

    loadInitialData();
  }, []);

  // ── Cargar historial previo si viene con sessionId ─────────────────────────

  useEffect(() => {
    if (!sessionId) return;

    async function loadSessionHistory() {
      const token = await SecureStore.getItemAsync('token');
      try {
        const res = await fetch(`${API}/interactions?session_id=${sessionId}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (!res.ok) return;
        const data = await res.json();
        const interactions: { id: number; query: string; response: string; created_at: string }[] =
          Array.isArray(data) ? data : data.data ?? [];
        interactions.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        const history: Message[] = interactions.flatMap(i => [
          { id: `h-user-${i.id}`, role: 'user' as const, content: i.query },
          { id: `h-assistant-${i.id}`, role: 'assistant' as const, content: i.response },
        ]);
        setMessages(history);
      } catch {
        // si falla la carga del historial se abre el chat vacío
      }
    }

    loadSessionHistory();
  }, [sessionId]);

  // ── Logout ─────────────────────────────────────────────────────────────────

  async function handleLogout() {
    const token = await SecureStore.getItemAsync('token');
    try {
      await fetch(`${API}/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
    } catch {
      // ignorar error de red en logout
    }
    await SecureStore.deleteItemAsync('token');
    navigation.replace('Login');
  }

  // ── Enviar mensaje ─────────────────────────────────────────────────────────

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    const assistantId = (Date.now() + 1).toString();

    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    const token = await SecureStore.getItemAsync('token');

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    let processed = 0;

    xhr.open('POST', `${API}/chat/stream`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(processed);
      processed = xhr.responseText.length;

      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        console.log('[SSE raw]', raw);
        try {
          const parsed = JSON.parse(raw);
          const delta: string = parsed.chunk ?? '';
          if (!delta) continue;
          setMessages(prev =>
            prev.map(m => (m.id === assistantId ? { ...m, content: m.content + delta } : m))
          );
        } catch {
          // línea SSE no-JSON, ignorar
        }
      }
    };

    xhr.onload = () => {
      setStreaming(false);
      xhrRef.current = null;
    };

    xhr.onerror = () => {
      setStreaming(false);
      xhrRef.current = null;
      Alert.alert('Error de red', 'No se pudo conectar con el servidor.');
    };

    const body: Record<string, unknown> = { question: text };
    if (selectedCategory !== 'all') body.category_ids = [selectedCategory];
    if (advanced) body.advanced = true;
    if (sessionId) body.session_id = sessionId;

    xhr.send(JSON.stringify(body));
  }

  // ── Render mensaje ─────────────────────────────────────────────────────────

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isUser = item.role === 'user';
      const showCursor = streaming && item.role === 'assistant' && !item.content;
      return (
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          {isUser ? (
            <Text style={styles.textUser}>{item.content}</Text>
          ) : showCursor ? (
            <Text style={styles.textAssistant}>▍</Text>
          ) : (
            <Markdown style={markdownStyles}>{item.content}</Markdown>
          )}
        </View>
      );
    },
    [streaming]
  );

  // ── Pantalla de bienvenida ─────────────────────────────────────────────────

  const WelcomeScreen = (
    <View style={styles.welcome}>
      <View style={styles.welcomeIcon}>
        <Text style={styles.welcomeIconText}>🔧</Text>
      </View>
      <Text style={styles.welcomeTitle}>Hola, soy tu asistente técnico</Text>
      <Text style={styles.welcomeSubtitle}>
        Pregúntame sobre averías, códigos de error o procedimientos de reparación de electrodomésticos.
      </Text>
      {loadingSuggestions ? (
        <ActivityIndicator color="#2563eb" style={{ marginTop: 24 }} />
      ) : suggestions.length > 0 ? (
        <View style={styles.suggestionsGrid}>
          {suggestions.map((s, i) => (
            <TouchableOpacity
              key={i}
              style={styles.suggestionCard}
              onPress={() => sendMessage(s.query)}
            >
              <Text style={styles.suggestionText}>{s.query}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ReparaElec</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate('History')} style={styles.historyBtn}>
            <Text style={styles.historyBtnText}>🕐</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filtros de categoría */}
      <View style={styles.categoriesWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesContent}
        >
          {categories.map(cat => {
            const active = cat.id === selectedCategory;
            return (
              <TouchableOpacity
                key={String(cat.id)}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Lista de mensajes / pantalla de bienvenida */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={renderMessage}
        contentContainerStyle={[styles.messageList, messages.length === 0 && { flexGrow: 1 }]}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={WelcomeScreen}
      />

      {/* Barra de entrada */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.inputBar}>
          <TouchableOpacity
            style={[styles.advancedBtn, advanced && styles.advancedBtnActive]}
            onPress={() => setAdvanced(v => !v)}
          >
            <Text style={styles.advancedBtnIcon}>⚡</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Escribe tu pregunta..."
            placeholderTextColor="#9ca3af"
            value={input}
            onChangeText={setInput}
            multiline
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => sendMessage()}
            editable={!streaming}
          />

          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || streaming) && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || streaming}
          >
            {streaming ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center',
  },
  historyBtnText: { fontSize: 18, textAlign: 'center' },
  logoutBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#fee2e2' },
  logoutText: { fontSize: 14, fontWeight: '600', color: '#dc2626' },

  categoriesWrapper: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  categoriesContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  categoryChip: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#f9fafb',
  },
  categoryChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  categoryChipText: { fontSize: 14, fontWeight: '500', color: '#374151' },
  categoryChipTextActive: { color: '#fff' },

  messageList: { padding: 16, paddingBottom: 8 },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 10 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#2563eb', borderBottomRightRadius: 4 },
  bubbleAssistant: {
    alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  textUser: { fontSize: 15, lineHeight: 22, color: '#fff' },
  textAssistant: { fontSize: 15, lineHeight: 22, color: '#111827' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb',
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  advancedBtn: {
    width: 36, height: 36, borderRadius: 10,
    borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#f3f4f6',
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
  },
  advancedBtnActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  advancedBtnIcon: { fontSize: 18, textAlign: 'center' },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#111827',
  },
  sendBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#93c5fd' },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 24 },

  welcome: { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  welcomeIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  welcomeIconText: { fontSize: 36 },
  welcomeTitle: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 10 },
  welcomeSubtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22, maxWidth: 480 },
  suggestionsGrid: { marginTop: 32, width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  suggestionCard: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, maxWidth: '47%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  suggestionText: { fontSize: 14, color: '#374151', lineHeight: 20 },
});

const markdownStyles = {
  body: { color: '#111827', fontSize: 15, lineHeight: 22 },
  code_inline: {
    backgroundColor: '#f3f4f6', color: '#1d4ed8', borderRadius: 4, paddingHorizontal: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13,
  },
  fence: { backgroundColor: '#1e293b', borderRadius: 8, padding: 12, marginVertical: 6 },
  code_block: {
    backgroundColor: '#1e293b', borderRadius: 8, padding: 12, color: '#e2e8f0',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13,
  },
  strong: { fontWeight: '700' as const, color: '#111827' },
  em: { fontStyle: 'italic' as const },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
  heading1: { fontSize: 20, fontWeight: '700' as const, color: '#111827', marginVertical: 6 },
  heading2: { fontSize: 17, fontWeight: '700' as const, color: '#111827', marginVertical: 4 },
  heading3: { fontSize: 15, fontWeight: '600' as const, color: '#374151', marginVertical: 4 },
};
