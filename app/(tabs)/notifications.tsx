import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '@/lib/notifications';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const profile = await getProfile(user.id);
    const currentRole: Role = profile?.role ?? 'student';
    setRole(currentRole);

    if (currentRole === 'student') {
      setNotifications(await getNotifications(user.id));
    } else {
      setNotifications([]);
    }
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <Animated.View entering={FadeIn.duration(300)} style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Loading notifications...</Text>
      </Animated.View>
    );
  }

  if (role !== 'student') {
    return (
      <View style={styles.centered}>
        <Ionicons name="notifications-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.title}>Students Only</Text>
        <Text style={styles.muted}>
          Notifications are sent to students when events open or close.
        </Text>
      </View>
    );
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleOpen = async (notification: AppNotification) => {
    if (!notification.isRead) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
      );
      await markNotificationRead(notification.id);
    }
    if (notification.eventId) {
      router.push({
        pathname: '/event/[id]',
        params: { id: notification.eventId },
      });
    }
  };

  const handleMarkAll = async () => {
    if (!user || unreadCount === 0) return;
    setBusy(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    const { error } = await markAllNotificationsRead(user.id);
    setBusy(false);
    if (error) {
      await load();
    }
  };

  if (notifications.length === 0) {
    return (
      <Animated.View entering={FadeInDown.duration(400)} style={styles.centered}>
        <Ionicons name="notifications-off-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.title}>No notifications yet</Text>
        <Text style={styles.muted}>
          You&apos;ll be notified here when a teacher creates or closes an event.
        </Text>
      </Animated.View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={notifications}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.headerTextWrap}>
            <Animated.Text entering={FadeInDown.duration(400)} style={styles.screenTitle}>
              Notifications
            </Animated.Text>
            <Text style={styles.mutedLeft}>
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
                : 'You are all caught up.'}
            </Text>
          </View>
          {unreadCount > 0 ? (
            <Pressable
              style={styles.markAllBtn}
              onPress={handleMarkAll}
              disabled={busy}
            >
              <Ionicons name="checkmark-done-outline" size={15} color={COLORS.primary} />
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>
          ) : null}
        </View>
      }
      renderItem={({ item, index }) => (
        <Animated.View
          entering={FadeInDown.delay(Math.min(index, 8) * 50).duration(300)}
        >
          <Pressable
            style={[styles.card, !item.isRead && styles.cardUnread]}
            onPress={() => handleOpen(item)}
          >
            <View
              style={[
                styles.iconWrap,
                item.kind === 'closed' ? styles.iconClosed : styles.iconNew,
              ]}
            >
              <Ionicons
                name={item.kind === 'closed' ? 'lock-closed-outline' : 'calendar-outline'}
                size={18}
                color={item.kind === 'closed' ? COLORS.textSecondary : COLORS.primary}
              />
            </View>
            <View style={styles.bodyWrap}>
              <View style={styles.titleRow}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {!item.isRead ? <View style={styles.dot} /> : null}
              </View>
              {item.body ? (
                <Text style={styles.cardBody}>{item.body}</Text>
              ) : null}
              <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
            </View>
            {item.eventId ? (
              <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
            ) : null}
          </Pressable>
        </Animated.View>
      )}
      ListFooterComponent={
        <View style={styles.footer}>
          <AppButton
            title="Back to Home"
            icon="home-outline"
            onPress={() => router.push('/')}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  listContent: {
    padding: 16,
    paddingTop: 32,
    paddingBottom: 48,
    gap: 10,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  headerTextWrap: {
    flex: 1,
    gap: 4,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  muted: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  mutedLeft: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
  },
  cardUnread: {
    borderColor: COLORS.primary,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconNew: {
    backgroundColor: COLORS.surface,
  },
  iconClosed: {
    backgroundColor: COLORS.background,
  },
  bodyWrap: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
  time: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  footer: {
    marginTop: 12,
  },
});
