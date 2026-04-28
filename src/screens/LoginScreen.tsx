import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '../services/api';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { AppColors } from '../theme';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { isDark, toggleTheme, colors } = useTheme();
  const styles = makeStyles(colors);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Introduce email y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const { token, name } = await api.login(email.trim(), password);
      await SecureStore.setItemAsync('token', token);
      if (name) await AsyncStorage.setItem('userName', name);
      navigation.replace('CategorySelect');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={24} color={colors.textSecondary} />
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.title}>ReparaElec</Text>
        <Text style={styles.subtitle}>Inicia sesión para continuar</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor={colors.placeholder}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    themeToggle: {
      position: 'absolute',
      top: 52,
      right: 24,
    },
    card: {
      width: '100%',
      maxWidth: 440,
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 32,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 4,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      marginBottom: 28,
      textAlign: 'center',
    },
    input: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.inputText,
      marginBottom: 16,
      backgroundColor: colors.inputBg,
    },
    button: {
      backgroundColor: colors.buttonBg,
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 4,
    },
    buttonDisabled: {
      backgroundColor: colors.buttonDisabled,
    },
    buttonText: {
      color: colors.buttonText,
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
