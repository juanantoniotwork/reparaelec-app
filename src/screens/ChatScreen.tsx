import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import * as api from '../services/api';
import { Category, Suggestion } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { useTheme } from '../ThemeContext';
import { AppColors } from '../theme';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Chat'>;
  route: RouteProp<RootStackParamList, 'Chat'>;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  interactionId?: number;
};

const ALL_CATEGORY: Category = { id: 'all', name: 'Todos' };

export default function ChatScreen({ navigation, route }: Props) {
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(
    route?.params?.sessionId ?? null
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const copyToastOpacity = useRef(new Animated.Value(0)).current;
  const [feedbackSent, setFeedbackSent] = useState<Record<string, 'positive' | 'negative'>>({});

  const [categories, setCategories] = useState<Category[]>([ALL_CATEGORY]);
  const [selectedCategory, setSelectedCategory] = useState<string | number>('all');

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [suggestionsError, setSuggestionsError] = useState(false);

  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const { isDark, toggleTheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const mdStyles = makeMarkdownStyles(colors);

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const listRef = useRef<FlatList<Message>>(null);


  // ── Carga inicial ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadInitialData() {
      setSuggestionsError(false);
      const [catRes, sugRes] = await Promise.allSettled([
        api.fetchCategories(),
        api.fetchSuggestions(),
      ]);

      if (catRes.status === 'fulfilled') {
        setCategories([ALL_CATEGORY, ...catRes.value]);
      }
      if (sugRes.status === 'fulfilled') {
        setSuggestions(sugRes.value);
      } else {
        setSuggestionsError(true);
      }

      setLoadingSuggestions(false);
    }

    loadInitialData();
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  async function handleRetrySuggestions() {
    setSuggestionsError(false);
    setLoadingSuggestions(true);
    try {
      const list = await api.fetchSuggestions();
      setSuggestions(list);
    } catch {
      setSuggestionsError(true);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  // ── Cargar historial previo si viene con sessionId ─────────────────────────

  useEffect(() => {
    if (!currentSessionId) return;

    async function loadSessionHistory() {
      try {
        const interactions = await api.fetchInteractions(currentSessionId!);
        interactions.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const history: Message[] = interactions.flatMap(i => [
          { id: `h-user-${i.id}`, role: 'user' as const, content: i.query },
          { id: `h-assistant-${i.id}`, role: 'assistant' as const, content: i.response, interactionId: i.id },
        ]);
        setMessages(history);
      } catch {
        // si falla la carga del historial se abre el chat vacío
      }
    }

    loadSessionHistory();
  }, [currentSessionId]);

  // ── Logout ─────────────────────────────────────────────────────────────────

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // ignorar error de red en logout
    }
    await SecureStore.deleteItemAsync('token');
    navigation.replace('Login');
  }

  // ── Nuevo chat ─────────────────────────────────────────────────────────────

  function handleNewChat() {
    setMessages([]);
    setCurrentSessionId(null);
    setInput('');
  }

  // ── Copiar al portapapeles ─────────────────────────────────────────────────

  const handleCopy = useCallback(async (id: string, content: string) => {
    await Clipboard.setStringAsync(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 2000);

    setShowCopyToast(true);
    copyToastOpacity.setValue(1);
    Animated.timing(copyToastOpacity, {
      toValue: 0,
      duration: 400,
      delay: 1200,
      useNativeDriver: true,
    }).start(() => setShowCopyToast(false));
  }, [copyToastOpacity]);

  // ── Enviar mensaje ─────────────────────────────────────────────────────────

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    const assistantId = (Date.now() + 1).toString();

    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    const body: Record<string, unknown> = { question: text };
    if (selectedCategory !== 'all') body.category_ids = [selectedCategory];
    if (advanced) body.advanced = true;
    if (currentSessionId) body.session_id = currentSessionId;

    const { xhr, send } = await api.buildChatStreamXhr(body);
    xhrRef.current = xhr;
    let processed = 0;

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
          if (parsed.interaction_id) {
            setMessages(prev =>
              prev.map(m => (m.id === assistantId ? { ...m, interactionId: parsed.interaction_id } : m))
            );
          }
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

    send();
  }

  // ── Feedback ────────────────────────────────────────────────────────────────

  const handleFeedback = useCallback(
    async (messageId: string, interactionId: number, feedback: 'positive' | 'negative') => {
      const previous = feedbackSent[messageId];
      setFeedbackSent(prev => ({ ...prev, [messageId]: feedback }));
      try {
        await api.sendFeedback(interactionId, feedback);
      } catch {
        setFeedbackSent(prev =>
          previous ? { ...prev, [messageId]: previous } : (() => { const next = { ...prev }; delete next[messageId]; return next; })()
        );
        Alert.alert('Error', 'No se pudo enviar el feedback.');
      }
    },
    [feedbackSent]
  );

  // ── Render mensaje ─────────────────────────────────────────────────────────

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isUser = item.role === 'user';
      const showCursor = streaming && item.role === 'assistant' && !item.content;
      const isCopied = copiedId === item.id;
      const isLastAssistant = !isUser && messages[messages.length - 1]?.id === item.id;
      const isStreaming = streaming && isLastAssistant;
      const sentFeedback = feedbackSent[item.id];

      return (
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          {isUser ? (
            <Text style={styles.textUser}>{item.content}</Text>
          ) : showCursor ? (
            <Text style={styles.textAssistant}>▍</Text>
          ) : (
            <>
              <Markdown style={mdStyles}>{item.content}</Markdown>
              <View style={styles.messageActions}>
                <TouchableOpacity
                  onPress={() => handleCopy(item.id, item.content)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons
                    name="copy-outline"
                    size={16}
                    color={isCopied ? '#2563eb' : colors.textSecondary}
                  />
                </TouchableOpacity>
                {!isStreaming && item.interactionId != null && (
                  <>
                    <TouchableOpacity
                      onPress={() => handleFeedback(item.id, item.interactionId!, 'positive')}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons
                        name="thumbs-up-outline"
                        size={20}
                        color={
                          sentFeedback === 'positive'
                            ? colors.buttonBg
                            : isDark ? '#6B7280' : '#9CA3AF'
                        }
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleFeedback(item.id, item.interactionId!, 'negative')}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons
                        name="thumbs-down-outline"
                        size={20}
                        color={
                          sentFeedback === 'negative'
                            ? colors.buttonBg
                            : isDark ? '#6B7280' : '#9CA3AF'
                        }
                      />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </>
          )}
        </View>
      );
    },
    [streaming, styles, mdStyles, copiedId, handleCopy, handleFeedback, feedbackSent, messages, colors, isDark]
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
      ) : suggestionsError ? (
        <View style={styles.suggestionsErrorView}>
          <Ionicons name="wifi-outline" size={32} color={colors.placeholder} />
          <Text style={styles.suggestionsErrorText}>Sin conexión. Comprueba tu red.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetrySuggestions}>
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
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
    <SafeAreaView style={[styles.container, { flex: 1 }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor="transparent" translucent />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleNewChat} activeOpacity={0.6}>
          <Text style={styles.headerTitle}>ReparaElec</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={toggleTheme} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons
              name={isDark ? 'sunny-outline' : 'moon-outline'}
              size={24}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('History')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="time-outline" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="log-out-outline" size={24} color={colors.textSecondary} />
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

      {/* Lista de mensajes + input */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMessage}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.messageList, messages.length === 0 && { flexGrow: 1 }]}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={WelcomeScreen}
        />

        {/* Botón flotante Nuevo chat — solo visible cuando hay mensajes */}
        {messages.length > 0 && (
          <TouchableOpacity
            style={[styles.fab, { bottom: 10 + 44 + 10 + insets.bottom + 10 }]}
            onPress={handleNewChat}
          >
            <Ionicons name="add-circle-outline" size={32} color={colors.textPrimary} />
          </TouchableOpacity>
        )}

        {/* Barra de entrada */}
        <View style={styles.inputBarOuter}>
          <View style={styles.inputBar}>
            <TouchableOpacity
              style={[styles.advancedBtn, advanced && styles.advancedBtnActive]}
              onPress={() => setAdvanced(v => !v)}
            >
              <Ionicons
                name="flash-outline"
                size={20}
                color={advanced ? '#2563eb' : colors.textSecondary}
              />
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              placeholder="Escribe tu pregunta..."
              placeholderTextColor={colors.placeholder}
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
          {/* Safe area spacer — solo cuando el teclado está cerrado */}
          {!keyboardVisible && <View style={{ height: insets.bottom }} />}
        </View>
      </KeyboardAvoidingView>

      {/* Toast de copiado */}
      {showCopyToast && (
        <Animated.View style={[styles.copyToast, { opacity: copyToastOpacity }]}>
          <Ionicons name="checkmark-circle" size={16} color="#fff" />
          <Text style={styles.copyToastText}>Copiado al portapapeles</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.card,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    fab: {
      position: 'absolute',
      right: 16,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 24,
      padding: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 4,
    },
    categoriesWrapper: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    categoriesContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
    categoryChip: {
      paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
      borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBg,
    },
    categoryChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    categoryChipText: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
    categoryChipTextActive: { color: '#fff' },

    messageList: { padding: 16, paddingBottom: 8 },
    bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 10 },
    bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#2563eb', borderBottomRightRadius: 4 },
    bubbleAssistant: {
      alignSelf: 'flex-start', backgroundColor: colors.card, borderBottomLeftRadius: 4,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    },
    textUser: { fontSize: 15, lineHeight: 22, color: '#fff' },
    textAssistant: { fontSize: 15, lineHeight: 22, color: colors.textPrimary },
    copyBtn: { alignSelf: 'flex-end', marginTop: 8 },
    messageActions: { flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', gap: 12, marginTop: 8 },

    inputBarOuter: {
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
      minHeight: 56,
    },
    advancedBtn: {
      width: 36, height: 36, borderRadius: 10,
      borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.background,
      alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
    },
    advancedBtnActive: { backgroundColor: colors.accentSurface, borderColor: '#2563eb' },
    input: {
      flex: 1, minHeight: 44, maxHeight: 120,
      backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.inputBorder,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.inputText,
    },
    sendBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
    sendBtnDisabled: { backgroundColor: colors.buttonDisabled },
    sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 24 },

    welcome: { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
    welcomeIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.accentSurface, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    welcomeIconText: { fontSize: 36 },
    welcomeTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 10 },
    welcomeSubtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 480 },
    suggestionsGrid: { marginTop: 32, width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
    suggestionCard: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, maxWidth: '47%',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
    },
    suggestionText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
    suggestionsErrorView: { marginTop: 32, alignItems: 'center', gap: 8 },
    suggestionsErrorText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
    retryBtn: { marginTop: 4, paddingVertical: 8, paddingHorizontal: 24, borderRadius: 8, backgroundColor: '#2563eb' },
    retryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

    copyToast: {
      position: 'absolute',
      bottom: 100,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(0,0,0,0.8)',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
    },
    copyToastText: { color: '#fff', fontSize: 13, fontWeight: '500' },
  });
}

function makeMarkdownStyles(colors: AppColors) {
  return {
    body: { color: colors.textPrimary, fontSize: 15, lineHeight: 22 },
    code_inline: {
      backgroundColor: colors.inputBg, color: '#1d4ed8', borderRadius: 4, paddingHorizontal: 4,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13,
    },
    fence: { backgroundColor: '#1e293b', borderRadius: 8, padding: 12, marginVertical: 6 },
    code_block: {
      backgroundColor: '#1e293b', borderRadius: 8, padding: 12, color: '#e2e8f0',
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13,
    },
    strong: { fontWeight: '700' as const, color: colors.textPrimary },
    em: { fontStyle: 'italic' as const },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
    list_item: { marginVertical: 2 },
    heading1: { fontSize: 20, fontWeight: '700' as const, color: colors.textPrimary, marginVertical: 6 },
    heading2: { fontSize: 17, fontWeight: '700' as const, color: colors.textPrimary, marginVertical: 4 },
    heading3: { fontSize: 15, fontWeight: '600' as const, color: colors.textSecondary, marginVertical: 4 },
  };
}
