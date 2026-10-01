import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme/colors';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setError(null);
    setBusy(true);
    const { error: err } = await signIn(username.trim(), password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.brand}>Amber Flow</Text>
        </View>
        <Text style={styles.tagline}>Sign in to your team account</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. jsmith"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={colors.textDim}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.button} onPress={handleSignIn} disabled={busy}>
          {busy ? <ActivityIndicator color="#1a0d00" /> : <Text style={styles.buttonText}>Sign In</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg0,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  logo: {
    width: 40,
    height: 40,
  },
  brand: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.accent,
  },
  tagline: {
    fontSize: 14,
    color: colors.textDim,
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textDim,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  button: {
    marginTop: 24,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#1a0d00',
    fontWeight: '700',
    fontSize: 15,
  },
  error: {
    color: colors.danger,
    marginBottom: 8,
    fontSize: 13,
  },
});
