import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!user) return;
      getProfile(user.id).then((profile) => {
        if (active) setRole(profile?.role ?? 'student');
      });
      return () => {
        active = false;
      };
    }, [user])
  );

  const subtitleByRole: Record<Role, string> = {
    student:
      'Browse events and scan event QR codes to record your attendance securely in the cloud.',
    teacher:
      'Create events, generate QR codes, and monitor who attended your classes.',
    admin:
      'Monitor campus-wide attendance, manage users, events, and records.',
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Header title="QR Attendance" />
        <Text style={styles.mainTitle}>School Event Attendance</Text>
        <Text style={styles.subtitle}>
          {role ? subtitleByRole[role] : subtitleByRole.student}
        </Text>
        <View style={styles.actions}>
          {!role ? (
            <ActivityIndicator size="large" color={COLORS.primary} />
          ) : role === 'student' ? (
            <>
              <AppButton
                theme="primary"
                title="Scan QR Code"
                icon="qr-code-outline"
                onPress={() => router.push('/scan')}
              />
              <AppButton
                title="Available Events"
                icon="calendar-outline"
                onPress={() => router.push('/events')}
              />
              <AppButton
                title="Attendance History"
                icon="time-outline"
                onPress={() => router.push('/history')}
              />
              <AppButton
                title="Profile"
                icon="person-outline"
                onPress={() => router.push('/profile')}
              />
            </>
          ) : role === 'teacher' ? (
            <>
              <AppButton
                theme="primary"
                title="Create / Manage Events"
                icon="clipboard-outline"
                onPress={() => router.push('/teacher')}
              />
              <AppButton
                title="Attendance History"
                icon="time-outline"
                onPress={() => router.push('/history')}
              />
              <AppButton
                title="Profile"
                icon="person-outline"
                onPress={() => router.push('/profile')}
              />
            </>
          ) : (
            <>
              <AppButton
                theme="primary"
                title="Admin Dashboard"
                icon="shield-outline"
                onPress={() => router.push('/admin')}
              />
              <AppButton
                title="Create / Manage Events"
                icon="clipboard-outline"
                onPress={() => router.push('/teacher')}
              />
              <AppButton
                title="Attendance History"
                icon="time-outline"
                onPress={() => router.push('/history')}
              />
              <AppButton
                title="Profile"
                icon="person-outline"
                onPress={() => router.push('/profile')}
              />
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 20,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.textSecondary,
    marginBottom: 24,
  },
  actions: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 12,
    paddingBottom: 32,
  },
});
