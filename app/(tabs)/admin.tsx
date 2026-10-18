import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';
import {
  getAdminStats,
  listAllAttendance,
  listUsers,
  removeAttendance,
  setAttendanceStatus,
  setUserRole,
  type AdminAttendanceRow,
  type AdminStats,
  type AdminUser,
} from '@/lib/admin';
import {
  getAllEvents,
  setEventStatus,
  type CloudEvent,
} from '@/lib/events';

type Section = 'overview' | 'users' | 'events' | 'attendance';

const SECTIONS: { key: Section; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'overview', label: 'Overview', icon: 'stats-chart-outline' },
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'events', label: 'Events', icon: 'calendar-outline' },
  { key: 'attendance', label: 'Attendance', icon: 'checkbox-outline' },
];

const ROLES: Role[] = ['student', 'teacher', 'admin'];

export default function AdminScreen() {
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [section, setSection] = useState<Section>('overview');

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [attendance, setAttendance] = useState<AdminAttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const isAdmin = role === 'admin';

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [nextStats, nextUsers, nextEvents, nextAttendance] =
      await Promise.all([
        getAdminStats(),
        listUsers(),
        getAllEvents(),
        listAllAttendance(),
      ]);
    setStats(nextStats);
    setUsers(nextUsers);
    setEvents(nextEvents);
    setAttendance(nextAttendance);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!user) {
        setRoleLoading(false);
        return () => {
          active = false;
        };
      }
      getProfile(user.id).then((profile) => {
        if (!active) return;
        const currentRole = profile?.role ?? 'student';
        setRole(currentRole);
        setRoleLoading(false);
        if (currentRole === 'admin') {
          loadAll();
        }
      });
      return () => {
        active = false;
      };
    }, [user, loadAll])
  );

  if (roleLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Checking your account...</Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.centered}>
        <Ionicons name="shield-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.title}>Administrators Only</Text>
        <Text style={styles.muted}>
          This dashboard is restricted to administrator accounts.
        </Text>
      </View>
    );
  }

  const handleChangeRole = (target: AdminUser, nextRole: Role) => {
    if (target.role === nextRole) return;
    Alert.alert(
      'Change role',
      `Change ${target.full_name ?? target.email} from ${target.role} to ${nextRole}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setBusy(true);
            const { error } = await setUserRole(target.id, nextRole);
            setBusy(false);
            if (error) Alert.alert('Could not change role', error);
            else loadAll();
          },
        },
      ]
    );
  };

  const handleToggleEvent = async (event: CloudEvent) => {
    const next = event.status === 'open' ? 'closed' : 'open';
    setBusy(true);
    const { error } = await setEventStatus(event.id, next);
    setBusy(false);
    if (error) Alert.alert('Error', error);
    else loadAll();
  };

  const handleToggleStatus = async (row: AdminAttendanceRow) => {
    const next = row.status === 'present' ? 'late' : 'present';
    setBusy(true);
    const { error } = await setAttendanceStatus(row.id, next);
    setBusy(false);
    if (error) Alert.alert('Error', error);
    else loadAll();
  };

  const handleRemove = (row: AdminAttendanceRow) => {
    Alert.alert(
      'Remove attendance record',
      `Delete ${row.studentName}'s record for "${row.eventTitle}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const { error } = await removeAttendance(row.id);
            setBusy(false);
            if (error) Alert.alert('Error', error);
            else loadAll();
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Admin Dashboard</Text>
        <Pressable style={styles.refreshBtn} onPress={loadAll} disabled={loading || busy}>
          <Ionicons name="refresh" size={16} color={COLORS.primary} />
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {/* Section tabs */}
      <View style={styles.sectionRow}>
        {SECTIONS.map((s) => (
          <Pressable
            key={s.key}
            style={[styles.sectionChip, section === s.key && styles.sectionChipActive]}
            onPress={() => setSection(s.key)}
          >
            <Ionicons
              name={s.icon}
              size={14}
              color={section === s.key ? COLORS.textOnPrimary : COLORS.textSecondary}
            />
            <Text
              style={[
                styles.sectionText,
                section === s.key && styles.sectionTextActive,
              ]}
            >
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.muted}>Loading dashboard...</Text>
        </View>
      ) : section === 'overview' ? (
        <View style={styles.statsGrid}>
          <StatCard icon="people-outline" label="Users" value={stats?.users ?? 0} />
          <StatCard icon="calendar-outline" label="Events" value={stats?.events ?? 0} />
          <StatCard icon="checkbox-outline" label="Records" value={stats?.records ?? 0} />
          <StatCard icon="checkmark-circle-outline" label="Present" value={stats?.present ?? 0} />
          <StatCard icon="time-outline" label="Late" value={stats?.late ?? 0} />
        </View>
      ) : section === 'users' ? (
        <View style={styles.stack}>
          <Text style={styles.sectionTitle}>Manage Users ({users.length})</Text>
          {users.length === 0 ? (
            <Text style={styles.muted}>No users found.</Text>
          ) : (
            users.map((u) => (
              <View key={u.id} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {u.full_name ?? u.email.split('@')[0]}
                </Text>
                <Text style={styles.meta}>{u.email}</Text>
                <View style={styles.roleRow}>
                  {ROLES.map((r) => (
                    <Pressable
                      key={r}
                      style={[
                        styles.roleChip,
                        u.role === r && styles.roleChipActive,
                      ]}
                      disabled={busy}
                      onPress={() => handleChangeRole(u, r)}
                    >
                      <Text
                        style={[
                          styles.roleChipText,
                          u.role === r && styles.roleChipTextActive,
                        ]}
                      >
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>
      ) : section === 'events' ? (
        <View style={styles.stack}>
          <Text style={styles.sectionTitle}>Manage Events ({events.length})</Text>
          {events.length === 0 ? (
            <Text style={styles.muted}>No events found.</Text>
          ) : (
            events.map((e) => {
              const closed = e.status === 'closed';
              return (
                <View key={e.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{e.title}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        closed ? styles.statusClosed : styles.statusOpen,
                      ]}
                    >
                      <Text style={styles.statusText}>
                        {closed ? 'Closed' : 'Open'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>{e.event_code}</Text>
                  {e.venue ? <Text style={styles.meta}>📍 {e.venue}</Text> : null}
                  <Pressable
                    style={[
                      styles.wideBtn,
                      closed ? styles.wideBtnOpen : styles.wideBtnClose,
                    ]}
                    disabled={busy}
                    onPress={() => handleToggleEvent(e)}
                  >
                    <Text
                      style={[
                        styles.wideBtnText,
                        { color: closed ? COLORS.success : COLORS.danger },
                      ]}
                    >
                      {closed ? 'Reopen Event' : 'Close Event'}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      ) : (
        <View style={styles.stack}>
          <Text style={styles.sectionTitle}>
            Attendance Records ({attendance.length})
          </Text>
          {attendance.length === 0 ? (
            <Text style={styles.muted}>No attendance records yet.</Text>
          ) : (
            attendance.map((row) => (
              <View key={row.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{row.studentName}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      row.status === 'late' ? styles.statusLate : styles.statusOpen,
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {row.status === 'late' ? 'Late' : 'Present'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.meta}>{row.eventTitle}</Text>
                <Text style={styles.meta}>
                  {new Date(row.scannedAt).toLocaleString()}
                </Text>
                <View style={styles.attendanceActions}>
                  <Pressable
                    style={[styles.actionBtn, styles.actionBtnFix]}
                    disabled={busy}
                    onPress={() => handleToggleStatus(row)}
                  >
                    <Text style={styles.actionBtnFixText}>
                      Mark as {row.status === 'present' ? 'Late' : 'Present'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, styles.actionBtnDelete]}
                    disabled={busy}
                    onPress={() => handleRemove(row)}
                  >
                    <Text style={styles.actionBtnDeleteText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={22} color={COLORS.primary} />
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
    paddingTop: 32,
    paddingBottom: 48,
  },
  centered: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  refreshText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  sectionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  sectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sectionChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  sectionText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  sectionTextActive: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 4,
    minWidth: '30%',
    flexGrow: 1,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  stack: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  meta: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusOpen: {
    backgroundColor: COLORS.success,
  },
  statusClosed: {
    backgroundColor: COLORS.danger,
  },
  statusLate: {
    backgroundColor: COLORS.warning,
  },
  statusText: {
    color: COLORS.textOnPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  roleChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: 'center',
  },
  roleChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  roleChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  roleChipTextActive: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
  },
  wideBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  wideBtnClose: {
    borderColor: COLORS.danger,
  },
  wideBtnOpen: {
    borderColor: COLORS.success,
  },
  wideBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  attendanceActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  actionBtnFix: {
    borderColor: COLORS.warning,
    backgroundColor: COLORS.card,
  },
  actionBtnFixText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.warning,
  },
  actionBtnDelete: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.card,
  },
  actionBtnDeleteText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.danger,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  muted: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
