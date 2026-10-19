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

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';
import {
  getAttendanceHistory,
  getAttendanceCounts,
  type AttendanceRecord,
  type AttendanceStatus,
} from '@/lib/attendance';
import {
  getEventPhase,
  getEventPhaseLabel,
  getEventsForManager,
  type CloudEvent,
  type EventPhase,
} from '@/lib/events';

const PHASE_STYLES: Record<EventPhase, { backgroundColor: string; color: string }> = {
  upcoming: { backgroundColor: COLORS.warning, color: COLORS.background },
  ongoing: { backgroundColor: COLORS.primary, color: COLORS.textOnPrimary },
  closed: { backgroundColor: COLORS.surface, color: COLORS.textSecondary },
};

function StatusBadge({ status }: { status: AttendanceStatus }) {
  const late = status === 'late';
  return (
    <View style={[styles.statusBadge, late ? styles.statusLate : styles.statusPresent]}>
      <Text style={styles.statusText}>{late ? 'Late' : 'Present'}</Text>
    </View>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [staffEvents, setStaffEvents] = useState<CloudEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

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
      setStudentRecords(await getAttendanceHistory(user.id));
      setStaffEvents([]);
      setCounts({});
    } else {
      const managerEvents = await getEventsForManager(currentRole, user.id);
      const nextCounts = await getAttendanceCounts(
        managerEvents.map((event) => event.id)
      );
      setStaffEvents(managerEvents);
      setCounts(nextCounts);
      setStudentRecords([]);
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
        <Text style={styles.muted}>Loading records...</Text>
      </Animated.View>
    );
  }

  if (role !== 'student') {
    if (staffEvents.length === 0) {
      return (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.centered}>
          <Ionicons name="calendar-outline" size={48} color={COLORS.textSecondary} />
          <Text style={styles.title}>No events yet</Text>
          <Text style={styles.muted}>
            Create an event in the Dashboard tab to see attendance here.
          </Text>
        </Animated.View>
      );
    }
    return (
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={staffEvents}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <Animated.Text entering={FadeInDown.duration(400)} style={styles.screenTitle}>
            Attendance
          </Animated.Text>
        }
        renderItem={({ item, index }) => {
          const phase = getEventPhase(item);
          const phaseStyle = PHASE_STYLES[phase];
          return (
            <Animated.View
              entering={FadeInDown.delay(Math.min(index, 8) * 60).duration(350)}
            >
              <Pressable
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() =>
                  router.push({
                    pathname: '/event/[id]',
                    params: { id: item.id },
                  })
                }
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{counts[item.id] ?? 0}</Text>
                  </View>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.code}>{item.event_code}</Text>
                  <View style={[styles.eventBadge, { backgroundColor: phaseStyle.backgroundColor }]}>
                    <Text style={[styles.eventBadgeText, { color: phaseStyle.color }]}>
                      {getEventPhaseLabel(phase)}
                    </Text>
                  </View>
                </View>
                {item.start_time ? (
                  <Text style={styles.code}>
                    {new Date(item.start_time).toLocaleString()}
                  </Text>
                ) : null}
                <View style={styles.openRow}>
                  <Text style={styles.openText}>Tap to manage attendance</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
                </View>
              </Pressable>
            </Animated.View>
          );
        }}
      />
    );
  }

  if (studentRecords.length === 0) {
    return (
      <Animated.View entering={FadeInDown.duration(400)} style={styles.centered}>
        <Ionicons name="time-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.title}>No records yet</Text>
        <Text style={styles.muted}>
          Scan an event QR code to record your attendance.
        </Text>
      </Animated.View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={studentRecords}
      ListHeaderComponent={
        <Animated.Text entering={FadeInDown.duration(400)} style={styles.screenTitle}>
          My Attendance
        </Animated.Text>
      }
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => (
        <Animated.View
          entering={FadeInDown.delay(Math.min(index, 8) * 60).duration(350)}
          style={styles.card}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{item.eventTitle}</Text>
            <StatusBadge status={item.status} />
          </View>
          <Text style={styles.code}>{item.eventId}</Text>
          <Text style={styles.attTime}>
            {new Date(item.scannedAt).toLocaleString()}
          </Text>
        </Animated.View>
      )}
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
    paddingTop: 24,
    paddingBottom: 40,
    gap: 12,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
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
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  cardPressed: {
    borderColor: COLORS.primary,
    opacity: 0.85,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  countBadge: {
    backgroundColor: COLORS.success,
    borderRadius: 20,
    minWidth: 40,
    height: 40,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: COLORS.textOnPrimary,
    fontWeight: '800',
    fontSize: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  code: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  eventBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  eventBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginLeft: 8,
  },
  statusPresent: {
    backgroundColor: COLORS.success,
  },
  statusLate: {
    backgroundColor: COLORS.warning,
  },
  statusText: {
    color: COLORS.textOnPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  attTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 8,
    paddingTop: 10,
  },
  openText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
