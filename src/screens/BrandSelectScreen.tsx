import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Brand, Favorite } from '../services/api';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { AppColors } from '../theme';
import LogoIcon from '../components/LogoIcon';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'BrandSelect'>;
  route: RouteProp<RootStackParamList, 'BrandSelect'>;
};

type FilterKey = 'all' | 'favorites' | 'recent';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'favorites', label: 'Favoritas' },
  { key: 'recent', label: 'Recientes' },
];

const RECENT_LIMIT = 5;

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
  if (filter === 'favorites') return 'No tienes marcas favoritas.';
  if (filter === 'recent') return 'No hay marcas recientes.';
  return 'No hay marcas disponibles.';
}

export default function BrandSelectScreen({ navigation, route }: Props) {
  const { categoryId, categoryName, subcategoryId, subcategoryName } = route.params;
  const { isDark, toggleTheme, colors } = useTheme();
  const styles = makeStyles(colors);

  const recentKey = `recent:brand:${String(subcategoryId)}`;

  const [brands, setBrands] = useState<Brand[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savingId, setSavingId] = useState<string | number | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    load();
    loadRecentIds(recentKey).then(setRecentIds);
  }, []);

  async function load() {
    setError(false);
    setLoading(true);
    try {
      const [bs, favs] = await Promise.all([
        api.getBrandsByCategory(subcategoryId),
        api.getFavorites().catch(() => [] as Favorite[]),
      ]);
      setBrands(bs);
      setFavorites(favs);
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

  function findFavorite(brandId: string | number): Favorite | null {
    return (
      favorites.find(
        f =>
          sameId(f.subcategory_id, subcategoryId) &&
          sameId(f.brand_id, brandId)
      ) ?? null
    );
  }

  async function toggleFavorite(brand: Brand) {
    if (savingId != null) return;
    setSavingId(brand.id);
    const existing = findFavorite(brand.id);
    try {
      if (existing) {
        await api.removeFavorite(existing.id);
        setFavorites(prev => prev.filter(f => f.id !== existing.id));
      } else {
        const created = await api.addFavorite(categoryId, subcategoryId, brand.id);
        const hydrated: Favorite = {
          ...created,
          category: created.category ?? { id: categoryId, name: categoryName },
          subcategory: created.subcategory ?? { id: subcategoryId, name: subcategoryName },
          brand: created.brand ?? brand,
        };
        setFavorites(prev => [...prev, hydrated]);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo guardar el favorito.');
    } finally {
      setSavingId(null);
    }
  }

  async function openChat(brand: Brand) {
    const next = await pushRecentId(recentKey, brand.id);
    setRecentIds(next);
    navigation.navigate('Chat', {
      categoryId,
      subcategoryId,
      brandId: brand.id,
      categoryName,
      subcategoryName,
      brandName: brand.name,
    });
  }

  const { favoriteBrands, otherBrands, showSections } = useMemo(() => {
    const q = normalize(query.trim());
    const matches = (b: Brand) => !q || normalize(b.name).includes(q);
    const alphabetical = (a: Brand, b: Brand) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });

    if (filter === 'favorites') {
      const list = brands
        .filter(b => findFavorite(b.id) != null && matches(b))
        .sort(alphabetical);
      return { favoriteBrands: [] as Brand[], otherBrands: list, showSections: false };
    }

    if (filter === 'recent') {
      const byId = new Map(brands.map(b => [String(b.id), b]));
      const list = recentIds
        .map(id => byId.get(id))
        .filter((b): b is Brand => !!b && matches(b));
      return { favoriteBrands: [] as Brand[], otherBrands: list, showSections: false };
    }

    const filtered = brands.filter(matches).sort(alphabetical);
    const favs = filtered.filter(b => findFavorite(b.id) != null);
    const rest = filtered.filter(b => findFavorite(b.id) == null);
    return { favoriteBrands: favs, otherBrands: rest, showSections: true };
  }, [brands, favorites, recentIds, query, filter]);

  function renderCard(brand: Brand) {
    const isFavorite = findFavorite(brand.id) != null;
    const saving = savingId === brand.id;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openChat(brand)}
        activeOpacity={0.7}
      >
        <Text style={styles.cardText}>{brand.name}</Text>
        <TouchableOpacity
          style={styles.starBtn}
          onPress={() => toggleFavorite(brand)}
          disabled={saving}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.buttonBg} />
          ) : (
            <Ionicons
              name={isFavorite ? 'star' : 'star-outline'}
              size={22}
              color={isFavorite ? colors.buttonBg : colors.textSecondary}
            />
          )}
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
          <Ionicons name="chevron-forward" size={12} color={colors.textSecondary} style={styles.breadcrumbSep} />
          <Text style={styles.breadcrumbText}>{subcategoryName}</Text>
        </TouchableOpacity>
        <Text style={styles.titleBig}>Selecciona la marca</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.placeholder} style={styles.searchIcon} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar marca... p. ej. Bosch, Samsung"
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
          <Text style={styles.errorText}>No se pudieron cargar las marcas.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={otherBrands}
          keyExtractor={b => String(b.id)}
          renderItem={({ item }) => renderCard(item)}
          ListHeaderComponent={
            showSections && favoriteBrands.length > 0 ? (
              <View>
                <Text style={styles.sectionLabel}>
                  {favoriteBrands.length === 1 ? 'FAVORITO' : 'FAVORITOS'}
                </Text>
                {favoriteBrands.map(b => (
                  <View key={String(b.id)}>{renderCard(b)}</View>
                ))}
                {otherBrands.length > 0 && <View style={styles.divider} />}
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            (showSections ? favoriteBrands.length : 0) === 0 ? (
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
    breadcrumbSep: {
      marginHorizontal: 4,
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
