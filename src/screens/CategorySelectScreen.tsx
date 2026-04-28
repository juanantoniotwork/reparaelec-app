import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import * as api from '../services/api';
import { Category } from '../services/api';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { AppColors } from '../theme';
import LogoIcon from '../components/LogoIcon';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CategorySelect'>;
};

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const ICON_ACCENT = '#2563eb';
const ICON_SURFACE = '#dbeafe';

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const CATEGORY_META: Record<string, { icon: IoniconName; desc: string }> = {
  'tecnologia': { icon: 'desktop-outline', desc: 'Ordenadores, móviles, routers' },
  'electrodomesticos': { icon: 'home-outline', desc: 'Lavadoras, frigoríficos, hornos' },
  'climatizacion': { icon: 'thermometer-outline', desc: 'Aire acondicionado, calefacción' },
  'imagen y sonido': { icon: 'tv-outline', desc: 'Televisores, audio, proyectores' },
};

function categoryMeta(name: string): { icon: IoniconName; desc: string } {
  return (
    CATEGORY_META[normalize(name)] ?? { icon: 'grid-outline', desc: 'Equipos técnicos' }
  );
}

export default function CategorySelectScreen({ navigation }: Props) {
  const { isDark, toggleTheme, colors } = useTheme();
  const styles = makeStyles(colors);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, [])
  );

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setError(false);
    setLoading(true);
    try {
      const cats = await api.fetchCategories();
      setCategories(cats);
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

  function goToSubcategory(cat: Category) {
    navigation.navigate('SubcategorySelect', {
      categoryId: cat.id,
      categoryName: cat.name,
    });
  }

  const roots = categories.filter(c => c.parent_id == null);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor="transparent" translucent />

      <View style={styles.headerRow}>
        <View style={styles.headerBrand}>
          <LogoIcon size={32} />
          <Text style={styles.brandText}>Reparaelec</Text>
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

      <View style={styles.headerDivider} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.buttonBg} />
        </View>
      ) : error ? (
        <View style={styles.errorView}>
          <Ionicons name="wifi-outline" size={48} color={colors.placeholder} />
          <Text style={styles.errorText}>Sin conexión. Comprueba tu red.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={roots}
          keyExtractor={c => String(c.id)}
          ListHeaderComponent={
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSubtitle}>Selecciona la categoría</Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = categoryMeta(item.name);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => goToSubcategory(item)}
                activeOpacity={0.7}
              >
                <View style={styles.iconBox}>
                  <Ionicons name={meta.icon} size={22} color={ICON_ACCENT} />
                </View>
                <View style={styles.cardTextBlock}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <Text style={styles.cardDesc}>{meta.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No hay categorías disponibles.</Text>
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

    listContent: { paddingBottom: 24 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 40 },

    sectionHeader: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
    sectionSubtitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 16,
      marginHorizontal: 16,
      marginVertical: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    iconBox: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: ICON_SURFACE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTextBlock: { flex: 1 },
    cardName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
    cardDesc: { fontSize: 13, color: colors.textSecondary },
  });
}
