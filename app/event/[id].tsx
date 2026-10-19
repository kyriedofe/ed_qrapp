import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';
import {
  deleteEvent,
  getEventById,
  getEventPhase,
  getEventPhaseLabel,
  setEventStatus,
  type CloudEvent,
  type EventPhase,
} from '@/lib/events';
import {
  deleteAttendanceRecord,
  getEventAttendanceDetail,
  getStudentAttendanceForEvent,
  updateAttendanceStatus,
  type EventAttendanceDetail,
  type MyAttendanceRecord,
} from '@/lib/attendance';

type AttendanceFilter = 'all' | 'present' | 'late' | 'missing';

const PHASE_STYLES: Record<EventPhase, { backgroundColor: string; color: string }> = {
  upcoming: { backgroundColor: COLORS.warning, color: COLORS.background },
  ongoing: { backgroundColor: COLORS.primary, color: COLORS.textOnPrimary },
  closed: { backgroundColor: COLORS.surface, color: COLORS.textSecondary },
};

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [event, setEvent] = useState<CloudEvent | null>(null);
  const [role, setRole] = useState<Role>('student');
  const [detail, setDetail] = useState<EventAttendanceDetail | null>(null);
  const [myRecord, setMyRecord] = useState<MyAttendanceRecord>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AttendanceFilter>('all');
  const [message, setMessage] = useState<string | null>(null);

  const isStaff = role === 'teacher' || role === 'admin';

  const load = useCallback(async () => {
    if (!id || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const profile = await getProfile(user.id);
    const currentRole: Role = profile?.role ?? 'student';
    const nextEvent = await getEventById(id);

    setRole(currentRole);
    setEvent(nextEvent);

    if (nextEvent) {
      if (currentRole === 'student') {
        setMyRecord(await getStudentAttendanceForEvent(user.id, id));
        setDetail(null);
      } else {
        setDetail(await getEventAttendanceDetail(id));
        setMyRecord(null);
      }
    }
    setLoading(false);
  }, [id, user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ headerShown: true, title: 'Event' }} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Loading event...</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ headerShown: true, title: 'Event' }} />
        <Ionicons name="calendar-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.emptyTitle}>Event not found</Text>
        <Text style={styles.muted}>
          It may have been deleted, or you may not have access to it.
        </Text>
        <AppButton title="Go Back" icon="arrow-back-outline" onPress={() => router.back()} />
      </View>
    );
  }

  const phase = getEventPhase(event);
  const phaseStyle = PHASE_STYLES[phase];
  const attendees = detail?.attendees ?? [];
  const nonAttendees = detail?.nonAttendees ?? [];
  const presentCount = attendees.filter((a) => a.status === 'present').length;
  const lateCount = attendees.filter((a) => a.status === 'late').length;

  const query = search.trim().toLowerCase();
  const matches = (name: string, email: string | null) =>
    !query ||
    name.toLowerCase().includes(query) ||
    (email ?? '').toLowerCase().includes(query);

  const visibleAttendees = attendees
    .filter((a) => matches(a.studentName, a.studentEmail))
    .filter((a) =>
      filter === 'all' || filter === 'present' || filter === 'late'
        ? filter === 'all' || a.status === filter
        : false
    );

  const visibleMissing =
    filter === 'missing'
      ? nonAttendees.filter((n) => matches(n.studentName, n.studentEmail))
      : [];

  const handleToggleAttendance = async (
    attendanceId: string,
    next: 'present' | 'late'
  ) => {
    setBusyId(attendanceId);
    const { error } = await updateAttendanceStatus(attendanceId, next);
    if (error) {
      setBusyId(null);
      Alert.alert('Could not update attendance', error);
      return;
    }
    setMessage(`Attendance marked ${next}.`);
    await load();
    setBusyId(null);
  };

  const handleRemoveAttendance = (attendanceId: string, studentName: string) => {
    Alert.alert(
      'Remove attendance',
      `Remove ${studentName}'s attendance record from this event?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusyId(attendanceId);
            const { error } = await deleteAttendanceRecord(attendanceId);
            if (error) {
              setBusyId(null);
              Alert.alert('Could not remove record', error);
              return;
            }
            setMessage('Attendance record removed.');
            await load();
            setBusyId(null);
          },
        },
      ]
    );
  };

  const handleToggleStatus = () => {
    const closing = event.status === 'open';
    Alert.alert(
      closing ? 'Close event' : 'Reopen event',
      closing
        ? `"${event.title}" will stop accepting QR scans. Students will be notified.`
        : `"${event.title}" will accept QR scans again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: closing ? 'Close' : 'Reopen',
          style: closing ? 'destructive' : 'default',
          onPress: async () => {
            const { error } = await setEventStatus(
              event.id,
              closing ? 'closed' : 'open'
            );
            if (error) {
              Alert.alert('Error', error);
              return;
            }
            setMessage(closing ? 'Event closed.' : 'Event reopened.');
            await load();
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete event',
      `"${event.title}" and its ${attendees.length} attendance record(s) will be permanently deleted. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteEvent(event.id);
            if (error) {
              Alert.alert('Error', error);
              return;
            }
            router.replace('/teacher');
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: isStaff ? 'Manage Event' : 'Event Details',
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.textPrimary,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
        }}
      />

      <Animated.View entering={FadeInDown.duration(350)} style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{event.title}</Text>
          <View style={[styles.badge, { backgroundColor: phaseStyle.backgroundColor }]}>
            <Text style={[styles.badgeText, { color: phaseStyle.color }]}>
              {getEventPhaseLabel(phase)}
            </Text>
          </View>
        </View>
        <Text style={styles.code}>{event.event_code}</Text>
        {event.description ? (
          <Text style={styles.description}>{event.description}</Text>
        ) : null}
        {event.venue ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.meta}>{event.venue}</Text>
          </View>
        ) : null}
        {event.start_time ? (
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.meta}>
              {new Date(event.start_time).toLocaleString()}
              {event.end_time
                ? ` — ${new Date(event.end_time).toLocaleTimeString()}`
                : ''}
            </Text>
          </View>
        ) : null}
      </Animated.View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {isStaff ? (
        <>
          <Animated.View entering={FadeInDown.delay(60).duration(350)} style={styles.statsGrid}>
            <StatCard icon="people-outline" label="Checked in" value={attendees.length} />
            <StatCard icon="checkmark-circle-outline" label="Present" value={presentCount} tone={COLORS.success} />
            <StatCard icon="time-outline" label="Late" value={lateCount} tone={COLORS.warning} />
            <StatCard icon="close-circle-outline" label="Not checked in" value={nonAttendees.length} tone={COLORS.danger} />
          </Animated.View>

          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or email"
            placeholderTextColor={COLORS.textSecondary}
          />

          <View style={styles.filterRow}>
            {(
              [
                { key: 'all', label: `All (${attendees.length})` },
                { key: 'present', label: `Present (${presentCount})` },
                { key: 'late', label: `Late (${lateCount})` },
                { key: 'missing', label: `Not checked in (${nonAttendees.length})` },
              ] as { key: AttendanceFilter; label: string }[]
            ).map((item) => (
              <Pressable
                key={item.key}
                style={[styles.chip, filter === item.key && styles.chipActive]}
                onPress={() => setFilter(item.key)}
              >
                <Text
                  style={[
                    styles.chipText,
                    filter === item.key && styles.chipTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {filter === 'missing' ? (
            visibleMissing.length === 0 ? (
              <Text style={styles.muted}>
                {nonAttendees.length === 0
                  ? 'Everyone has checked in — or student lists are unavailable until the Part II migration is run.'
                  : 'No students match this search.'}
              </Text>
            ) : (
              visibleMissing.map((student) => (
                <View key={student.studentId} style={styles.attRow}>
                  <View style={styles.attInfo}>
                    <Text style={styles.attName}>{student.studentName}</Text>
                    <Text style={styles.attEmail}>{student.studentEmail ?? 'No email'}</Text>
                  </View>
                  <View style={[styles.statusBadge, styles.statusMissing]}>
                    <Text style={[styles.statusText, { color: COLORS.textSecondary }]}>
                      Not checked in
                    </Text>
                  </View>
                </View>
              ))
            )
          ) : visibleAttendees.length === 0 ? (
            <Text style={styles.muted}>
              {attendees.length === 0
                ? 'No attendance records yet.'
                : 'No students match this filter.'}
            </Text>
          ) : (
            visibleAttendees.map((a) => {
              const late = a.status === 'late';
              const busy = busyId === a.attendanceId;
              return (
                <View key={a.attendanceId} style={styles.attRow}>
                  <View style={styles.attInfo}>
                    <Text style={styles.attName}>{a.studentName}</Text>
                    <Text style={styles.attEmail}>{a.studentEmail ?? 'No email'}</Text>
                    <Text style={styles.attTime}>
                      {new Date(a.scannedAt).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.attRight}>
                    <View style={[styles.statusBadge, late ? styles.statusLate : styles.statusPresent]}>
                      <Text style={styles.statusText}>{late ? 'Late' : 'Present'}</Text>
                    </View>
                    <View style={styles.attButtons}>
                      <Pressable
                        style={styles.iconBtn}
                        disabled={busy}
                        onPress={() =>
                          handleToggleAttendance(
                            a.attendanceId,
                            late ? 'present' : 'late'
                          )
                        }
                      >
                        <Ionicons
                          name={late ? 'checkmark-circle-outline' : 'time-outline'}
                          size={18}
                          color={late ? COLORS.success : COLORS.warning}
                        />
                      </Pressable>
                      <Pressable
                        style={styles.iconBtn}
                        disabled={busy}
                        onPress={() => handleRemoveAttendance(a.attendanceId, a.studentName)}
                      >
                        <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })
          )}

          <View style={styles.manageWrap}>
            <Text style={styles.sectionTitle}>Manage Event</Text>
            <AppButton
              title="Edit Event"
              icon="create-outline"
              onPress={() =>
                router.push({ pathname: '/teacher', params: { edit: event.id } })
              }
            />
            <AppButton
              title={event.status === 'closed' ? 'Reopen Event' : 'Close Event'}
              icon={event.status === 'closed' ? 'lock-open-outline' : 'lock-closed-outline'}
              onPress={handleToggleStatus}
            />
            <AppButton
              title="Delete Event"
              icon="trash-outline"
              onPress={handleDelete}
            />
          </View>
        </>
      ) : (
        <>
          <Animated.View entering={FadeInDown.delay(60).duration(350)} style={styles.card}>
            <Text style={styles.sectionTitle}>Your Attendance</Text>
            {myRecord ? (
              <>
                <View style={styles.myStatusRow}>
                  <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                  <Text style={styles.myStatusText}>
                    You are marked {myRecord.status === 'late' ? 'Late' : 'Present'}
                  </Text>
                </View>
                <Text style={styles.meta}>
                  Checked in {new Date(myRecord.scannedAt).toLocaleString()}
                </Text>
              </>
            ) : (
              <View style={styles.myStatusRow}>
                <Ionicons name="alert-circle-outline" size={22} color={COLORS.warning} />
                <Text style={styles.myStatusText}>Not checked in yet</Text>
              </View>
            )}
          </Animated.View>

          {phase === 'closed' ? (
            <Text style={styles.muted}>
              This event is closed. Attendance can no longer be recorded.
            </Text>
          ) : myRecord ? (
            <Text style={styles.muted}>
              Your attendance is already recorded for this event.
            </Text>
          ) : (
            <AppButton
              theme="primary"
              title="Scan QR to Check In"
              icon="qr-code-outline"
              onPress={() => router.push('/scan')}
            />
          )}
        </>
      )}
    </ScrollView>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone = COLORS.primary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={20} color={tone} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 12,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  code: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: COLORS.textSecondary,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  meta: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  message: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.success,
  },
  muted: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCard: {
    flexGrow: 1,
    minWidth: '44%',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  search: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
  },
  attRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
  },
  attInfo: {
    flex: 1,
    gap: 2,
  },
  attName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  attEmail: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  attTime: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  attRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  attButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  iconBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 6,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPresent: {
    backgroundColor: COLORS.success,
  },
  statusLate: {
    backgroundColor: COLORS.warning,
  },
  statusMissing: {
    backgroundColor: COLORS.surface,
  },
  statusText: {
    color: COLORS.textOnPrimary,
    fontSize: 10,
    fontWeight: '800',
  },
  manageWrap: {
    gap: 10,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  myStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  myStatusText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});
