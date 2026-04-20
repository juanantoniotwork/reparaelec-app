import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as api from '../services/api';
import { Interaction } from '../services/api';
import Markdown from 'react-native-markdown-display';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { AppColors } from '../theme';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'SessionDetail'>;
  route: RouteProp<RootStackParamList, 'SessionDetail'>;
};

export default function SessionDetailScreen({ navigation, route }: Props) {
  const { sessionId } = route.params;
  console.log('[SessionDetail] sessionId recibido de route.params:', sessionId);

  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const { isDark, toggleTheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets.top, insets.bottom);
  const mdStyles = makeMarkdownStyles(colors);

  useEffect(() => {
    async function load() {
      try {
        setError(null);
        const list = await api.fetchInteractions(sessionId);
        list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        setInteractions(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sin conexión. Comprueba tu red.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId, retryCount]);

  const renderItem = ({ item }: { item: Interaction }) => (
    <>
      <View style={[styles.bubble, styles.bubbleUser]}>
        <Text style={styles.textUser}>{item.query}</Text>
      </View>
      <View style={[styles.bubble, styles.bubbleAssistant]}>
        <Markdown style={mdStyles}>{item.response}</Markdown>
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Conversación</Text>
        <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : error ? (
        <View style={styles.errorView}>
          <Ionicons name="wifi-outline" size={48} color={colors.placeholder} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); setError(null); setRetryCount(c => c + 1); }}>
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={interactions}
            keyExtractor={i => String(i.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No hay mensajes en esta sesión.</Text>
              </View>
            }
          />
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.continueBtn}
              onPress={() => {
                console.log('[SessionDetail] navegando a Chat con sessionId:', sessionId);
                navigation.reset({ index: 0, routes: [{ name: 'Chat', params: { sessionId } }] });
              }}
            >
              <Text style={styles.continueBtnText}>Continuar conversación</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

function makeStyles(colors: AppColors, topInset: number, bottomInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    emptyText: { fontSize: 16, color: colors.placeholder },
    errorView: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    errorText: { fontSize: 16, color: colors.textSecondary, marginTop: 12, textAlign: 'center' },
    retryBtn: { marginTop: 20, paddingVertical: 10, paddingHorizontal: 28, borderRadius: 8, backgroundColor: '#2563eb' },
    retryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.card, paddingHorizontal: 16,
      paddingTop: topInset + 14, paddingBottom: 14,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    backBtn: { width: 40, alignItems: 'flex-start' },
    backBtnText: { fontSize: 22, color: '#2563eb' },
    themeToggle: { width: 40, alignItems: 'flex-end', justifyContent: 'center' },

    list: { padding: 16, gap: 10 },
    bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10 },
    bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#2563eb', borderBottomRightRadius: 4 },
    bubbleAssistant: {
      alignSelf: 'flex-start', backgroundColor: colors.card, borderBottomLeftRadius: 4,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    },
    textUser: { fontSize: 15, lineHeight: 22, color: '#fff' },

    footer: {
      backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border,
      paddingHorizontal: 16, paddingTop: 16,
      paddingBottom: bottomInset > 0 ? bottomInset + 8 : 16,
    },
    continueBtn: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  });
}

function makeMarkdownStyles(colors: AppColors) {
  return {
    body: { color: colors.textPrimary, fontSize: 15, lineHeight: 22 },
    code_inline: {
      backgroundColor: colors.inputBg, color: '#1d4ed8', borderRadius: 4,
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
