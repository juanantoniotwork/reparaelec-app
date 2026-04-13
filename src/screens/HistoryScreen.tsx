import React, { useCallback, useEffect, useState } from 'react';
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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'History'>;
};

type Interaction = {
  id: number;
  query: string;
  response: string;
  session_id: number;
  created_at: string;
};

const API = 'https://api.reparaelec.servidortigres.com/api';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function HistoryScreen({ navigation }: Props) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchInteractions() {
    const token = await SecureStore.getItemAsync('token');
    const res = await fetch(`${API}/interactions`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('Error al cargar el historial');
    const json = await res.json();
    console.log('[interactions response]', JSON.stringify(json));
    const items: Interaction[] = Array.isArray(json) ? json : json.data ?? [];
    setInteractions(items);
  }

  useEffect(() => {
    fetchInteractions()
      .catch(() => Alert.alert('Error', 'No se pudo cargar el historial.'))
      .finally(() => setLoading(false));
  }, []);

  async function deleteSession(id: number) {
    Alert.alert('Eliminar sesión', '¿Seguro que quieres eliminar esta conversación?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const token = await SecureStore.getItemAsync('token');
          try {
            const res = await fetch(`${API}/sessions/${id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            });
            if (!res.ok) throw new Error();
            setInteractions(prev => prev.filter(i => i.id !== id));
          } catch {
            Alert.alert('Error', 'No se pudo eliminar la sesión.');
          }
        },
      },
    ]);
  }

  const renderItem = useCallback(
    ({ item }: { item: Interaction }) => (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('SessionDetail', { sessionId: item.session_id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardBody}>
          <Text style={styles.cardQuestion} numberOfLines={2}>
            {item.query}
          </Text>
          <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => deleteSession(item.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.deleteBtnText}>🗑</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    ),
    []
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
        <Text style={styles.headerTitle}>Historial</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={interactions}
        keyExtractor={i => String(i.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No hay conversaciones guardadas.</Text>
          </View>
        }
      />
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
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardBody: { flex: 1, marginRight: 12 },
  cardQuestion: { fontSize: 15, fontWeight: '500', color: '#111827', marginBottom: 4, lineHeight: 21 },
  cardDate: { fontSize: 13, color: '#9ca3af' },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 18 },
});
