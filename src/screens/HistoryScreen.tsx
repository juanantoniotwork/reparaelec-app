import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as api from '../services/api';
import { Interaction } from '../services/api';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { AppColors } from '../theme';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'History'>;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function HistoryScreen({ navigation }: Props) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isDark, toggleTheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets.top);

  async function loadInteractions(isRefresh = false) {
    try {
      setError(null);
      const items = await api.fetchInteractions();
      console.log('[interactions response]', JSON.stringify(items));
      setInteractions(items);
    } catch (err) {
      if (isRefresh) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Sin conexión. Comprueba tu red.');
      } else {
        setError('Sin conexión. Comprueba tu red.');
      }
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }

  useEffect(() => {
    loadInteractions();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await loadInteractions(true);
  }

  function handleRetry() {
    setLoading(true);
    loadInteractions();
  }

  async function deleteSession(id: number) {
    Alert.alert('Eliminar sesión', '¿Seguro que quieres eliminar esta conversación?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteSession(id);
            setInteractions(prev => prev.filter(i => i.session_id !== id));
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
        onPress={() => navigation.navigate('SessionDetail', { sessionId: item.session_id! })}
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
          onPress={() => {
            console.log('[HistoryScreen] delete item:', JSON.stringify(item), '→ session_id:', item.session_id);
            deleteSession(item.session_id);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    ),
    [styles]
  );

  return (
    <View style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Historial</Text>
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
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={interactions}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#2563eb"
              colors={['#2563eb']}
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No hay conversaciones guardadas.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function makeStyles(colors: AppColors, topInset: number) {
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
    card: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.card, borderRadius: 14,
      paddingHorizontal: 16, paddingVertical: 14,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    },
    cardBody: { flex: 1, marginRight: 12 },
    cardQuestion: { fontSize: 15, fontWeight: '500', color: colors.textPrimary, marginBottom: 4, lineHeight: 21 },
    cardDate: { fontSize: 13, color: colors.placeholder },
    deleteBtn: { padding: 4 },
  });
}
