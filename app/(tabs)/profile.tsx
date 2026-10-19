import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth, signOut } from '@/lib/auth';
import { getProfile, updateProfile, type Profile } from '@/lib/profiles';

export default function ProfileScreen() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draftName, setDraftName] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const p = await getProfile(user.id);
    setProfile(p);
    setDraftName(p?.full_name ?? '');
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleSaveName = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await updateProfile(user.id, {
      full_name: draftName.trim(),
    });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error);
    } else {
      setProfile((prev) =>
        prev ? { ...prev, full_name: draftName.trim() } : prev
      );
      setEditing(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
      router.replace('/login');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to sign out.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Animated.Text entering={FadeInDown.duration(400)} style={styles.title}>
        My Profile
      </Animated.Text>

      {profile?.role === 'admin' ? (
        <Animated.View
          entering={FadeInDown.delay(80).duration(400)}
          style={[styles.roleBadge, styles.roleBadgeAdmin]}
        >
          <Text style={[styles.roleBadgeText, styles.roleBadgeTextAdmin]}>
            Administrator
          </Text>
        </Animated.View>
      ) : profile?.role === 'teacher' ? (
        <Animated.View
          entering={FadeInDown.delay(80).duration(400)}
          style={styles.roleBadge}
        >
          <Text style={styles.roleBadgeText}>Teacher</Text>
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeInDown.delay(80).duration(400)}
          style={[styles.roleBadge, styles.roleBadgeStudent]}
        >
          <Text style={styles.roleBadgeText}>Student</Text>
        </Animated.View>
      )}

      <Animated.View
        entering={FadeInDown.delay(140).duration(400)}
        style={styles.infoCard}
      >
        <Text style={styles.label}>Name</Text>
        {editing ? (
          <View style={styles.nameEditRow}>
            <TextInput
              style={styles.nameInput}
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Enter your name"
              placeholderTextColor={COLORS.textSecondary}
            />
            <Pressable
              style={styles.saveBtn}
              onPress={handleSaveName}
              disabled={saving}
            >
              <Text style={styles.saveText}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setEditing(true)} style={styles.nameRow}>
            <Text style={styles.value}>
              {profile?.full_name || 'Tap to add your name'}
            </Text>
            <Text style={styles.editHint}>Edit</Text>
          </Pressable>
        )}

        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user?.email ?? profile?.email}</Text>

        <Text style={styles.label}>User ID</Text>
        <Text style={styles.valueSmall}>{user?.id}</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(400)}>
        <AppButton
          title="Sign Out"
          icon="log-out-outline"
          onPress={handleSignOut}
          disabled={loading}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 12,
  },
  roleBadgeStudent: {
    backgroundColor: COLORS.warning,
  },
  roleBadgeAdmin: {
    backgroundColor: COLORS.textOnPrimary,
  },
  roleBadgeText: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
    fontSize: 12,
  },
  roleBadgeTextAdmin: {
    color: COLORS.background,
  },
  infoCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 16,
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
    marginTop: 8,
  },
  value: {
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  valueSmall: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editHint: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  nameEditRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  nameInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  saveText: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
  },
});
