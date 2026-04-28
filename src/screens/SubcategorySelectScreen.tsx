import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as api from '../services/api';
import { Category } from '../services/api';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { AppColors } from '../theme';
import LogoIcon from '../components/LogoIcon';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'SubcategorySelect'>;
  route: RouteProp<RootStackParamList, 'SubcategorySelect'>;
};

type FilterKey = 'all' | 'favorites' | 'recent';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'favorites', label: 'Favoritas' },
  { key: 'recent', label: 'Recientes' },
];

const RECENT_LIMIT = 5;
const FAVORITE_SUBS_KEY = 'favorite_subcategories';

function sameId(a: string | number | null | undefined, b: string | number | null | undefined) {
  return a != null && b != null && String(a) === String(b);
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function loadRecentIds(key: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function pushRecentId(key: string, id: string | number): Promise<string[]> {
  const idStr = String(id);
  const prev = await loadRecentIds(key);
  const next = [idStr, ...prev.filter(x => x !== idStr)].slice(0, RECENT_LIMIT);
  await AsyncStorage.setItem(key, JSON.stringify(next));
  return next;
}

function emptyMessage(filter: FilterKey, query: string): string {
  if (query) return 'Sin resultados.';
  if (filter === 'favorites') return 'No tienes subcategorías favoritas.';
  if (filter === 'recent') return 'No hay subcategorías recientes.';
  return 'No hay subcategorías disponibles.';
}

export default function SubcategorySelectScreen({ navigation, route }: Props) {
  const { categoryId, categoryName } = route.params;
  const { isDark, toggleTheme, colors } = useTheme();
  const styles = makeStyles(colors);

  const recentKey = `recent:subcategory:${String(categoryId)}`;

  const [subcategories, setSubcategories] = useState<Category[]>([]);
  const [favoriteSubIds, setFavoriteSubIds] = useState<Set<string>>(new Set());
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    load();
    loadRecentIds(recentKey).then(setRecentIds);
    AsyncStorage.getItem(FAVORITE_SUBS_KEY).then(raw => {
      if (!raw) return;
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setFavoriteSubIds(new Set(arr.map(String)));
      } catch {
        // ignore
      }
    });
  }, []);

  async function load() {
    setError(false);
    setLoading(true);
    try {
      const cats = await api.fetchCategories();
      const selected = cats.find(c => sameId(c.id, categoryId));
      const children =
        selected?.children ?? cats.filter(c => sameId(c.parent_id, categoryId));
      const sorted = [...children].sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      );
      setSubcategories(sorted);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // ignorar
    }
    await SecureStore.deleteItemAsync('token');
    navigation.replace('Login');
  }

  async function goToBrand(sub: Category) {
    const next = await pushRecentId(recentKey, sub.id);
    setRecentIds(next);
    navigation.navigate('BrandSelect', {
      categoryId,
      categoryName,
      subcategoryId: sub.id,
      subcategoryName: sub.name,
    });
  }

  function toggleSubFavorite(id: string | number) {
    const idStr = String(id);
    setFavoriteSubIds(prev => {
      const next = new Set(prev);
      if (next.has(idStr)) next.delete(idStr);
      else next.add(idStr);
      AsyncStorage.setItem(FAVORITE_SUBS_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }

  const { favoriteSubs, otherSubs, showSections } = useMemo(() => {
    const q = normalize(query.trim());
    const matches = (s: Category) => !q || normalize(s.name).includes(q);

    if (filter === 'favorites') {
      const list = subcategories.filter(s => favoriteSubIds.has(String(s.id)) && matches(s));
      return { favoriteSubs: [] as Category[], otherSubs: list, showSections: false };
    }

    if (filter === 'recent') {
      const byId = new Map(subcategories.map(s => [String(s.id), s]));
      const list = recentIds
        .map(id => byId.get(id))
        .filter((s): s is Category => !!s && matches(s));
      return { favoriteSubs: [] as Category[], otherSubs: list, showSections: false };
    }

    const filtered = subcategories.filter(matches);
    const favs = filtered.filter(s => favoriteSubIds.has(String(s.id)));
    const rest = filtered.filter(s => !favoriteSubIds.has(String(s.id)));
    return { favoriteSubs: favs, otherSubs: rest, showSections: true };
  }, [subcategories, favoriteSubIds, recentIds, query, filter]);

  function renderCard(item: Category) {
    const isFav = favoriteSubIds.has(String(item.id));
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => goToBrand(item)}
        activeOpacity={0.7}
      >
        <Text style={styles.cardText}>{item.name}</Text>
        <TouchableOpacity
          style={styles.starBtn}
          onPress={() => toggleSubFavorite(item.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={isFav ? 'star' : 'star-outline'}
            size={22}
            color={isFav ? colors.buttonBg : colors.textSecondary}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor="transparent" translucent />

      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.headerBrand}
          onPress={() => navigation.popToTop()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <LogoIcon size={32} />
          <Text style={styles.brandText}>Reparaelec</Text>
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

      <View style={styles.headerDivider} />

      <View style={styles.titleBlock}>
        <TouchableOpacity
          style={styles.breadcrumb}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={14} color={colors.textSecondary} />
          <Text style={styles.breadcrumbText}>{categoryName}</Text>
        </TouchableOpacity>
        <Text style={styles.titleBig}>Selecciona la subcategoría</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.placeholder} style={styles.searchIcon} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar subcategoría... p. ej. lavadora, congelador"
          placeholderTextColor={colors.placeholder}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.chip, active && styles.chipActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.buttonBg} />
        </View>
      ) : error ? (
        <View style={styles.errorView}>
          <Ionicons name="wifi-outline" size={48} color={colors.placeholder} />
          <Text style={styles.errorText}>No se pudieron cargar las subcategorías.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={otherSubs}
          keyExtractor={c => String(c.id)}
          renderItem={({ item }) => renderCard(item)}
          ListHeaderComponent={
            showSections && favoriteSubs.length > 0 ? (
              <View>
                <Text style={styles.sectionLabel}>
                  {favoriteSubs.length === 1 ? 'FAVORITO' : 'FAVORITOS'}
                </Text>
                {favoriteSubs.map(s => (
                  <View key={String(s.id)}>{renderCard(s)}</View>
                ))}
                {otherSubs.length > 0 && <View style={styles.divider} />}
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            (showSections ? favoriteSubs.length : 0) === 0 ? (
              <Text style={styles.emptyText}>{emptyMessage(filter, query)}</Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
    },
    headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    brandText: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    headerDivider: { height: 1, backgroundColor: colors.border },

    titleBlock: {
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 6,
    },
    breadcrumb: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 2,
      marginBottom: 4,
    },
    breadcrumbText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    titleBig: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.textPrimary,
    },

    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.inputBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      marginHorizontal: 20,
      marginTop: 10,
      marginBottom: 10,
      paddingHorizontal: 12,
    },
    searchIcon: { marginRight: 8 },
    searchInput: {
      flex: 1,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.inputText,
    },

    filterRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    chip: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipActive: {
      backgroundColor: colors.buttonBg,
      borderColor: colors.buttonBg,
    },
    chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    chipTextActive: { color: '#fff' },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    errorView: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    errorText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: 10 },
    retryBtn: {
      marginTop: 12,
      paddingVertical: 10,
      paddingHorizontal: 24,
      borderRadius: 8,
      backgroundColor: colors.buttonBg,
    },
    retryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

    listContent: { paddingTop: 6, paddingBottom: 24 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 40 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      letterSpacing: 1,
      paddingHorizontal: 24,
      paddingTop: 6,
      marginBottom: 2,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: 12,
      marginHorizontal: 20,
    },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginHorizontal: 20,
      marginVertical: 5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 2,
    },
    cardText: { flex: 1, fontSize: 16, color: colors.textPrimary, fontWeight: '500' },
    starBtn: {
      marginLeft: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
