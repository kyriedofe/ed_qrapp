import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';
import {
  getAttendanceHistory,
  getTeacherEventAttendance,
  type AttendanceRecord,
  type AttendanceStatus,
  type TeacherEventAttendance,
} from '@/lib/attendance';

function shortId(id: string) {
  return id ? `…${id.slice(-8)}` : 'unknown';
}

function StatusBadge({ status }: { status: AttendanceStatus }) {
  const late = status === 'late';
  return (
    <View style={[styles.statusBadge, late ? styles.statusLate : styles.statusPresent]}>
      <Text style={styles.statusText}>{late ? 'Late' : 'Present'}</Text>
    </View>
  );
}

export default function HistoryScreen() {
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const profile = await getProfile(user.id);
    const currentRole = profile?.role ?? 'student';
    setRole(currentRole);

    if (currentRole === 'student') {
      const records = await getAttendanceHistory(user.id);
      setStudentRecords(records);
      setTeacherEvents([]);
    } else {
      // Teachers AND admins see the events they manage
      const events = await getTeacherEventAttendance(user.id);
      setTeacherEvents(events);
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
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Loading records...</Text>
      </View>
    );
  }

  if (role !== 'student') {
    if (teacherEvents.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.title}>No events yet</Text>
          <Text style={styles.muted}>
            Create an event in the Teacher tab to see attendance here.
          </Text>
        </View>
      );
    }
    return (
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={teacherEvents}
        keyExtractor={(item) => item.eventId}
        ListHeaderComponent={<Text style={styles.screenTitle}>History</Text>}
        renderItem={({ item }) => {
          // Event date: created_at, falling back to startTime
          const eventDate = item.createdAt ?? item.startTime;
          const closed = item.eventStatus === 'closed';
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{item.attendeeCount}</Text>
                </View>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.code}>{item.eventCode}</Text>
                <View
                  style={[
                    styles.eventBadge,
                    closed ? styles.eventClosed : styles.eventOpen,
                  ]}
                >
                  <Text style={styles.eventBadgeText}>
                    {closed ? 'Closed' : 'Open'}
                  </Text>
                </View>
              </View>
              {eventDate ? (
                <Text style={styles.code}>
                  {new Date(eventDate).toLocaleString()}
                </Text>
              ) : null}
              <View style={styles.divider} />
              {/* Attendees are listed below once they have scanned */}
              {item.attendees.length === 0 ? (
                <Text style={styles.emptyScans}>No scans yet</Text>
              ) : (
                item.attendees.map((a) => (
                  <View key={`${item.eventId}-${a.studentId}`} style={styles.attRow}>
                    <View style={styles.attInfo}>
                      <Text style={styles.attName}>
                        {a.studentName ?? shortId(a.studentId)}
                      </Text>
                      <Text style={styles.attTime}>
                        {new Date(a.scannedAt).toLocaleString()}
                      </Text>
                    </View>
                    <StatusBadge status={a.status} />
                  </View>
                ))
              )}
            </View>
          );
        }}
      />
    );
  }

  if (studentRecords.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>No records yet</Text>
        <Text style={styles.muted}>
          Scan an event QR code to record your attendance.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={studentRecords}
      ListHeaderComponent={<Text style={styles.screenTitle}>History</Text>}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{item.eventTitle}</Text>
            <StatusBadge status={item.status} />
          </View>
          <Text style={styles.code}>{item.eventId}</Text>
          <Text style={styles.attTime}>
            {new Date(item.scannedAt).toLocaleString()}
          </Text>
        </View>
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
    paddingTop: 48,
    gap: 12,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  emptyScans: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: 4,
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
    borderRadius: 20,
    padding: 18,
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
  },
  countBadge: {
    backgroundColor: COLORS.success,
    borderRadius: 24,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
    fontSize: 18,
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
  eventOpen: {
    backgroundColor: COLORS.success,
  },
  eventClosed: {
    backgroundColor: COLORS.danger,
  },
  eventBadgeText: {
    color: COLORS.textOnPrimary,
    fontSize: 10,
    fontWeight: '700',
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
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 10,
  },
  attRow: {
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attInfo: {
    flex: 1,
  },
  attName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  attTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});
