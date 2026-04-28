import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
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
import { ChatStreamBody } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { useTheme } from '../ThemeContext';
import { AppColors } from '../theme';
import LogoIcon from '../components/LogoIcon';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Chat'>;
  route: RouteProp<RootStackParamList, 'Chat'>;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  interactionId?: number;
  timestamp?: number;
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDaySeparator(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const time = formatTime(ts);
  if (d.toDateString() === now.toDateString()) return `HOY · ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `AYER · ${time}`;
  const date = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${date} · ${time}`;
}

export default function ChatScreen({ navigation, route }: Props) {
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(
    route?.params?.sessionId ?? null
  );

  const subcategoryId = route?.params?.subcategoryId;
  const brandId = route?.params?.brandId;
  const subcategoryName = route?.params?.subcategoryName;
  const brandName = route?.params?.brandName;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [responseLength, setResponseLength] = useState<'short' | 'normal' | 'detailed'>('normal');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const copyToastOpacity = useRef(new Animated.Value(0)).current;
  const [feedbackSent, setFeedbackSent] = useState<Record<string, 'positive' | 'negative'>>({});

  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const { isDark, toggleTheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const mdStyles = makeMarkdownStyles(colors);

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const listRef = useRef<FlatList<Message>>(null);


  // ── Carga inicial ──────────────────────────────────────────────────────────

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    const didShowSub = Keyboard.addListener('keyboardDidShow', () => {
      listRef.current?.scrollToEnd({ animated: true });
      if (Platform.OS === 'android') {
        setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 120);
      }
    });
    return () => { showSub.remove(); hideSub.remove(); didShowSub.remove(); };
  }, []);

  // ── Cargar historial previo si viene con sessionId ─────────────────────────

  useEffect(() => {
    if (!currentSessionId) return;

    async function loadSessionHistory() {
      try {
        const interactions = await api.fetchInteractions(currentSessionId!);
        interactions.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const history: Message[] = interactions.flatMap(i => {
          const ts = new Date(i.created_at).getTime();
          return [
            { id: `h-user-${i.id}`, role: 'user' as const, content: i.query, timestamp: ts },
            { id: `h-assistant-${i.id}`, role: 'assistant' as const, content: i.response, interactionId: i.id, timestamp: ts },
          ];
        });
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

    const now = Date.now();
    const userMsg: Message = { id: now.toString(), role: 'user', content: text, timestamp: now };
    const assistantId = (now + 1).toString();

    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', timestamp: now }]);
    setInput('');
    setStreaming(true);

    const body: ChatStreamBody = { question: text };
    if (subcategoryId != null) body.category_ids = [subcategoryId];
    if (brandId != null) body.brand_id = brandId;
    if (advanced) body.advanced = true;
    if (currentSessionId) body.session_id = currentSessionId;
    if (responseLength !== 'normal') body.response_length = responseLength;

    console.log('[chat] params entrantes:', JSON.stringify({
      subcategoryId, brandId, subcategoryName, brandName,
      subcategoryIdType: typeof subcategoryId,
      brandIdType: typeof brandId,
    }));
    console.log('[chat] payload body:', JSON.stringify(body));

    const { xhr, send } = await api.buildChatStreamXhr(body);
    xhrRef.current = xhr;
    let processed = 0;
    let chunkCount = 0;

    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(processed);
      processed = xhr.responseText.length;
      console.log('[chat] onprogress — readyState:', xhr.readyState, 'status:', xhr.status, 'bytes:', chunk.length);
      console.log('[SSE chunk]', chunk);

      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') {
          console.log('[SSE] terminator:', raw || '(empty)');
          continue;
        }
        chunkCount++;
        console.log('[SSE raw #' + chunkCount + ']', raw);
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
        } catch (err) {
          console.log('[SSE parse error]', err instanceof Error ? err.message : err, 'raw:', raw);
        }
      }
    };

    xhr.onload = () => {
      console.log('[chat] onload — status:', xhr.status, 'chunks recibidos:', chunkCount, 'responseText length:', xhr.responseText.length);
      console.log('[chat] onload body[0..200]:', xhr.responseText.slice(0, 200));
      if (xhr.status >= 400) {
        console.log('[chat] response body (error):', xhr.responseText.slice(0, 2000));
      } else if (chunkCount === 0) {
        console.log('[chat] responseText completo (sin chunks SSE):', xhr.responseText.slice(0, 2000));
      }
      setStreaming(false);
      xhrRef.current = null;
    };

    xhr.onerror = () => {
      console.log('[chat] onerror — status:', xhr.status, 'readyState:', xhr.readyState, 'responseText:', xhr.responseText.slice(0, 500));
      setStreaming(false);
      xhrRef.current = null;
      Alert.alert('Error de red', 'No se pudo conectar con el servidor.');
    };

    send();
    console.log('[chat] send() invocado');
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

      if (isUser) {
        return (
          <View style={styles.messageWrap}>
            <View style={[styles.bubble, styles.bubbleUser]}>
              <Text style={styles.textUser}>{item.content}</Text>
            </View>
            {item.timestamp != null && (
              <Text style={styles.userTimestamp}>{formatTime(item.timestamp)}</Text>
            )}
          </View>
        );
      }

      return (
        <View style={styles.messageWrap}>
          <View style={styles.assistantHeader}>
            <LogoIcon size={20} />
            <Text style={styles.assistantLabel}>Asistente técnico</Text>
          </View>
          <View style={[styles.bubble, styles.bubbleAssistant]}>
            {showCursor ? (
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
        </View>
      );
    },
    [streaming, styles, mdStyles, copiedId, handleCopy, handleFeedback, feedbackSent, messages, colors, isDark]
  );

  // ── Pantalla de bienvenida ─────────────────────────────────────────────────

  const contextLabel = subcategoryName && brandName
    ? `${subcategoryName} ${brandName}`
    : subcategoryName || brandName || '';
  const subtitleContext = subcategoryName && brandName
    ? `${subcategoryName.toLowerCase()} ${brandName}`
    : contextLabel.toLowerCase() || 'electrodomésticos';

  const suggestions = brandName
    ? [
        `Códigos de error habituales en ${brandName}`,
        `Averías más frecuentes en ${subtitleContext}`,
        `Diagnóstico: ${subtitleContext} no enciende`,
        `¿Cómo desmontar un ${subtitleContext}?`,
      ]
    : [
        'Códigos de error habituales',
        'Averías más frecuentes',
        'Pasos de diagnóstico inicial',
        '¿Cómo desmontar el aparato?',
      ];

  const WelcomeScreen = (
    <View style={styles.welcome}>
      <View style={styles.welcomeIcon}>
        <LogoIcon size={48} />
      </View>
      <Text style={styles.welcomeTitle}>
        Hola, soy tu asistente técnico
        {contextLabel ? ' en' : ''}
        {contextLabel ? '\n' : ''}
        {contextLabel ? <Text style={styles.welcomeTitleAccent}>{contextLabel}</Text> : null}
      </Text>
      <Text style={styles.welcomeSubtitle}>
        Pregúntame sobre averías, códigos de error o procedimientos de reparación de {subtitleContext}.
      </Text>
      <View style={styles.suggestionsBlock}>
        <Text style={styles.suggestionsLabel}>EJEMPLOS</Text>
        {suggestions.map((text, i) => (
          <TouchableOpacity
            key={i}
            style={styles.suggestionCard}
            onPress={() => sendMessage(text)}
            activeOpacity={0.7}
          >
            <Text style={styles.suggestionText}>{text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { flex: 1 }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor="transparent" translucent />
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {navigation.canGoBack() ? (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={28} color={colors.buttonBg} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.headerBrand}
            onPress={() => navigation.popToTop()}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <LogoIcon size={28} />
            <Text style={styles.brandText}>Reparaelec</Text>
          </TouchableOpacity>
        </View>
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

      {/* Lista de mensajes + input */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={m => m.id}
            renderItem={renderMessage}
            style={{ flex: 1 }}
            contentContainerStyle={[styles.messageList, messages.length === 0 && { flexGrow: 1 }]}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={WelcomeScreen}
            ListHeaderComponent={
              messages.length > 0 && messages[0].timestamp != null ? (
                <Text style={styles.daySeparator}>{formatDaySeparator(messages[0].timestamp)}</Text>
              ) : null
            }
          />
        </View>

        {/* Barra de entrada */}
        <View style={styles.inputBarOuter}>
          <View style={styles.inputBar}>
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
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    brandText: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    backBtn: { marginLeft: -8 },
    messageList: { padding: 16, paddingBottom: 8 },
    daySeparator: {
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      letterSpacing: 0.5,
      marginBottom: 16,
      marginTop: 4,
    },
    messageWrap: { marginBottom: 14 },
    bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10 },
    bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#2563eb', borderBottomRightRadius: 4 },
    bubbleAssistant: {
      alignSelf: 'flex-start', backgroundColor: colors.card, borderBottomLeftRadius: 4,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    },
    textUser: { fontSize: 15, lineHeight: 22, color: '#fff' },
    textAssistant: { fontSize: 15, lineHeight: 22, color: colors.textPrimary },
    userTimestamp: {
      alignSelf: 'flex-end',
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 4,
      paddingRight: 6,
      paddingLeft: 2,
      includeFontPadding: false,
    },
    assistantHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      marginBottom: 6,
    },
    assistantLabel: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
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
    input: {
      flex: 1, minHeight: 44, maxHeight: 120,
      backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.inputBorder,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.inputText,
    },
    sendBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
    sendBtnDisabled: { backgroundColor: colors.buttonDisabled },
    sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 24 },

    welcome: { flex: 1, alignItems: 'center', paddingTop: 40, paddingHorizontal: 24 },
    welcomeIcon: { marginBottom: 20 },
    welcomeTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 10, lineHeight: 30 },
    welcomeTitleAccent: { color: colors.buttonBg },
    welcomeSubtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 480 },
    suggestionsBlock: { marginTop: 32, width: '100%', alignSelf: 'stretch', gap: 8 },
    suggestionsLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      letterSpacing: 1,
      marginBottom: 4,
    },
    suggestionCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    suggestionText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },

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
