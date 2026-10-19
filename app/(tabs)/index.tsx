import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import AppButton from '@/components/AppButton';
import EventCard from '@/components/EventCard';
import Header from '@/components/Header';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';
import {
  getAllEvents,
  getEventPhase,
  type CloudEvent,
} from '@/lib/events';
import { getStudentAttendedEventIds } from '@/lib/attendance';
import {
  getNotifications,
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

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [attendedIds, setAttendedIds] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const profile = await getProfile(user.id);
    const currentRole: Role = profile?.role ?? 'student';
    setRole(currentRole);

    if (currentRole === 'student') {
      const [allEvents, attended, notes] = await Promise.all([
        getAllEvents(),
        getStudentAttendedEventIds(user.id),
        getNotifications(user.id, 3),
      ]);
      setEvents(allEvents);
      setAttendedIds(attended);
      setNotifications(notes);
    }
    setDataLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const subtitleByRole: Record<Role, string> = {
    student:
      'Browse events and scan event QR codes to record your attendance securely in the cloud.',
    teacher:
      'Create events, generate QR codes, and monitor who attended your classes.',
    admin:
      'Monitor campus-wide attendance, manage users, events, and records.',
  };

  const activeEvents = events.filter((event) => getEventPhase(event) !== 'closed');
  const previewEvents = (activeEvents.length > 0 ? activeEvents : events).slice(0, 3);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const openNotification = async (notification: AppNotification) => {
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
    } else {
      router.push('/notifications');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Header title="QR Attendance" />
        <Animated.Text
          entering={FadeInDown.delay(80).duration(400)}
          style={styles.mainTitle}
        >
          School Event Attendance
        </Animated.Text>
        <Animated.Text
          entering={FadeInDown.delay(140).duration(400)}
          style={styles.subtitle}
        >
          {role ? subtitleByRole[role] : subtitleByRole.student}
        </Animated.Text>

        {!role ? (
          <ActivityIndicator size="large" color={COLORS.primary} />
        ) : role === 'student' ? (
          <>
            <Animated.View
              entering={FadeInDown.delay(200).duration(400)}
              style={styles.actions}
            >
              <AppButton
                theme="primary"
                title="Scan QR Code"
                icon="qr-code-outline"
                onPress={() => router.push('/scan')}
              />
              <AppButton
                title="View All Events"
                icon="calendar-outline"
                onPress={() => router.push('/events')}
              />
            </Animated.View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Notifications</Text>
              <Pressable onPress={() => router.push('/notifications')}>
                <Text style={styles.link}>
                  View all{unreadCount > 0 ? ` (${unreadCount})` : ''}
                </Text>
              </Pressable>
            </View>

            {dataLoading ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : notifications.length === 0 ? (
              <Text style={styles.muted}>
                No notifications yet. You&apos;ll hear from us when events are posted.
              </Text>
            ) : (
              notifications.map((notification) => (
                <Pressable
                  key={notification.id}
                  style={[
                    styles.notifRow,
                    !notification.isRead && styles.notifUnread,
                  ]}
                  onPress={() => openNotification(notification)}
                >
                  <View style={styles.notifIcon}>
                    <Ionicons
                      name={
                        notification.kind === 'closed'
                          ? 'lock-closed-outline'
                          : 'calendar-outline'
                      }
                      size={16}
                      color={
                        notification.kind === 'closed'
                          ? COLORS.textSecondary
                          : COLORS.primary
                      }
                    />
                  </View>
                  <View style={styles.notifBody}>
                    <Text style={styles.notifTitle} numberOfLines={1}>
                      {notification.title}
                    </Text>
                    <Text style={styles.notifTime}>
                      {timeAgo(notification.createdAt)}
                    </Text>
                  </View>
                  {!notification.isRead ? <View style={styles.dot} /> : null}
                </Pressable>
              ))
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Events & Attendance</Text>
              <Text style={styles.sectionMeta}>
                {attendedIds.size} attended
              </Text>
            </View>

            {dataLoading ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : previewEvents.length === 0 ? (
              <Text style={styles.muted}>
                No events posted yet. Check back later.
              </Text>
            ) : (
              previewEvents.map((event, index) => (
                <EventCard
                  key={event.id}
                  event={event}
                  attended={attendedIds.has(event.id)}
                  index={index}
                  onPress={() =>
                    router.push({
                      pathname: '/event/[id]',
                      params: { id: event.id },
                    })
                  }
                />
              ))
            )}

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
          <Animated.View
            entering={FadeInDown.delay(200).duration(400)}
            style={styles.actions}
          >
            <AppButton
              theme="primary"
              title="Event Dashboard"
              icon="clipboard-outline"
              onPress={() => router.push('/teacher')}
            />
            <AppButton
              title="Attendance"
              icon="time-outline"
              onPress={() => router.push('/history')}
            />
            <AppButton
              title="Profile"
              icon="person-outline"
              onPress={() => router.push('/profile')}
            />
          </Animated.View>
        ) : (
          <Animated.View
            entering={FadeInDown.delay(200).duration(400)}
            style={styles.actions}
          >
            <AppButton
              theme="primary"
              title="Admin Dashboard"
              icon="shield-outline"
              onPress={() => router.push('/admin')}
            />
            <AppButton
              title="Event Dashboard"
              icon="clipboard-outline"
              onPress={() => router.push('/teacher')}
            />
            <AppButton
              title="Attendance"
              icon="time-outline"
              onPress={() => router.push('/history')}
            />
            <AppButton
              title="Profile"
              icon="person-outline"
              onPress={() => router.push('/profile')}
            />
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 10,
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 16,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  actions: {
    gap: 10,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.success,
  },
  link: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  muted: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    paddingVertical: 6,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
  },
  notifUnread: {
    borderColor: COLORS.primary,
  },
  notifIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBody: {
    flex: 1,
    gap: 2,
  },
  notifTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  notifTime: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
});
