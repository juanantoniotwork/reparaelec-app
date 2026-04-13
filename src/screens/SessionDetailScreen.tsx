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
import * as SecureStore from 'expo-secure-store';
import Markdown from 'react-native-markdown-display';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'SessionDetail'>;
  route: RouteProp<RootStackParamList, 'SessionDetail'>;
};

type Interaction = {
  id: number;
  query: string;
  response: string;
  created_at: string;
};

const API = 'https://api.reparaelec.servidortigres.com/api';

export default function SessionDetailScreen({ navigation, route }: Props) {
  const { sessionId } = route.params;
  console.log('[SessionDetail] sessionId recibido de route.params:', sessionId);

  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = await SecureStore.getItemAsync('token');
      try {
        const res = await fetch(`${API}/interactions?session_id=${sessionId}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const list: Interaction[] = Array.isArray(data) ? data : data.data ?? [];
        list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        setInteractions(list);
      } catch {
        Alert.alert('Error', 'No se pudo cargar la conversación.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  const renderItem = ({ item }: { item: Interaction }) => (
    <>
      <View style={[styles.bubble, styles.bubbleUser]}>
        <Text style={styles.textUser}>{item.query}</Text>
      </View>
      <View style={[styles.bubble, styles.bubbleAssistant]}>
        <Markdown style={markdownStyles}>{item.response}</Markdown>
      </View>
    </>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Conversación</Text>
        <View style={{ width: 40 }} />
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 16, color: '#9ca3af' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  backBtn: { width: 40, alignItems: 'flex-start' },
  backBtnText: { fontSize: 22, color: '#2563eb' },

  list: { padding: 16, gap: 10 },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#2563eb', borderBottomRightRadius: 4 },
  bubbleAssistant: {
    alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  textUser: { fontSize: 15, lineHeight: 22, color: '#fff' },

  footer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', padding: 16 },
  continueBtn: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

const markdownStyles = {
  body: { color: '#111827', fontSize: 15, lineHeight: 22 },
  code_inline: {
    backgroundColor: '#f3f4f6', color: '#1d4ed8', borderRadius: 4,
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
