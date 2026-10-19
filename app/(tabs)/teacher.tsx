import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';
import {
  createEvent,
  deleteEvent,
  getEventPhase,
  getEventPhaseLabel,
  getEventsForManager,
  getManagerStats,
  setEventStatus,
  updateEvent,
  type CloudEvent,
  type EventPhase,
  type ManagerStats,
} from '@/lib/events';
import { getAttendanceCounts } from '@/lib/attendance';
import { buildQRPayload } from '@/lib/qr';

const EMPTY_STATS: ManagerStats = {
  students: 0,
  events: 0,
  active: 0,
  closed: 0,
  records: 0,
};

const PHASE_STYLES: Record<
  EventPhase,
  { backgroundColor: string; color: string }
> = {
  upcoming: { backgroundColor: COLORS.warning, color: COLORS.background },
  ongoing: { backgroundColor: COLORS.primary, color: COLORS.textOnPrimary },
  closed: { backgroundColor: COLORS.surface, color: COLORS.textSecondary },
};

export default function TeacherScreen() {
  const router = useRouter();
  const { edit: editParam } = useLocalSearchParams<{ edit?: string }>();
  const { user } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const editAppliedRef = useRef<string | null>(null);

  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<ManagerStats>(EMPTY_STATS);
  const [listLoading, setListLoading] = useState(false);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 60 * 60 * 1000));
  const [editTarget, setEditTarget] = useState<'start' | 'end' | null>(null);
  const [editingPart, setEditingPart] = useState<'date' | 'time'>('date');
  const [payload, setPayload] = useState<string | null>(null);
  const [qrCodeLabel, setQrCodeLabel] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const isStaff = role === 'teacher' || role === 'admin';

  const loadDashboard = useCallback(async () => {
    if (!user || !role || (role !== 'teacher' && role !== 'admin')) return;
    setListLoading(true);
    const nextEvents = await getEventsForManager(role, user.id);
    const [nextStats, nextCounts] = await Promise.all([
      getManagerStats(role, user.id),
      getAttendanceCounts(nextEvents.map((e) => e.id)),
    ]);
    setEvents(nextEvents);
    setStats(nextStats);
    setCounts(nextCounts);
    setListLoading(false);
  }, [user, role]);

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
        setRole(profile?.role ?? 'student');
        setRoleLoading(false);
      });
      return () => {
        active = false;
      };
    }, [user])
  );

  useFocusEffect(
    useCallback(() => {
      if (isStaff) {
        loadDashboard();
      }
    }, [isStaff, loadDashboard])
  );

  const resetForm = useCallback(() => {
    setEditingId(null);
    setTitle('');
    setEventId('');
    setVenue('');
    setDescription('');
    setStartDate(new Date());
    setEndDate(new Date(Date.now() + 60 * 60 * 1000));
    setMessage(null);
  }, []);

  const beginEdit = useCallback((event: CloudEvent) => {
    setEditingId(event.id);
    setTitle(event.title);
    setEventId(event.event_code);
    setVenue(event.venue ?? '');
    setDescription(event.description ?? '');
    setStartDate(event.start_time ? new Date(event.start_time) : new Date());
    setEndDate(
      event.end_time
        ? new Date(event.end_time)
        : new Date(Date.now() + 60 * 60 * 1000)
    );
    setPayload(null);
    setFormVisible(true);
    setMessage(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  // "Edit" links elsewhere in the app navigate here with ?edit=<id>.
  useEffect(() => {
    if (!editParam || events.length === 0) return;
    if (editAppliedRef.current === editParam) return;
    const target = events.find((event) => event.id === editParam);
    if (target) {
      editAppliedRef.current = editParam;
      beginEdit(target);
    }
  }, [editParam, events, beginEdit]);

  if (roleLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Checking your account...</Text>
      </View>
    );
  }

  if (!isStaff) {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.title}>Teachers Only</Text>
        <Text style={styles.muted}>
          Only teacher and administrator accounts can manage events.
        </Text>
      </View>
    );
  }

  const handleQuickDuration = (minutes: number) => {
    setEndDate(new Date(startDate.getTime() + minutes * 60 * 1000));
  };

  const handleSaveEvent = () => {
    setMessage(null);
    if (!title.trim() || !eventId.trim()) {
      setMessage('Event title and code are required.');
      setMessageOk(false);
      return;
    }
    if (startDate >= endDate) {
      setMessage('Start time must be before end time.');
      setMessageOk(false);
      return;
    }

    const eventData = {
      eventId: eventId.trim(),
      title: title.trim(),
      venue: venue.trim(),
      description: description.trim(),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    };

    setSaving(true);
    const request = editingId
      ? updateEvent(editingId, {
          title: eventData.title,
          venue: eventData.venue,
          description: eventData.description,
          start: eventData.start,
          end: eventData.end,
        })
      : createEvent(eventData);

    request.then(({ error }) => {
      setSaving(false);
      if (error) {
        setMessage(`Could not save the event. ${error}`);
        setMessageOk(false);
        return;
      }
      setMessage(
        editingId
          ? 'Event updated successfully.'
          : 'Event created — students were notified and can scan the QR.'
      );
      setMessageOk(true);
      setPayload(buildQRPayload(eventData));
      setQrCodeLabel(eventData.eventId);
      setEditingId(null);
      setFormVisible(false);
      editAppliedRef.current = null;
      loadDashboard();
    });
  };

  const handleShowQr = (event: CloudEvent) => {
    setPayload(
      buildQRPayload({
        eventId: event.event_code,
        title: event.title,
        start: event.start_time ?? undefined,
        end: event.end_time ?? undefined,
      })
    );
    setQrCodeLabel(event.event_code);
    setMessage(null);
  };

  const handleToggleStatus = (event: CloudEvent) => {
    const next = event.status === 'open' ? 'closed' : 'open';
    const closing = next === 'closed';
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
            setBusyEventId(event.id);
            const { error } = await setEventStatus(event.id, next);
            setBusyEventId(null);
            if (error) {
              Alert.alert('Error', error);
              return;
            }
            setMessage(
              closing
                ? `"${event.title}" is now closed.`
                : `"${event.title}" is open again.`
            );
            setMessageOk(true);
            loadDashboard();
          },
        },
      ]
    );
  };

  const handleDelete = (event: CloudEvent) => {
    const count = counts[event.id] ?? 0;
    Alert.alert(
      'Delete event',
      `"${event.title}" and its ${count} attendance record(s) will be permanently deleted. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyEventId(event.id);
            const { error } = await deleteEvent(event.id);
            setBusyEventId(null);
            if (error) {
              Alert.alert('Error', error);
              return;
            }
            setMessage(`"${event.title}" was deleted.`);
            setMessageOk(true);
            if (payload && qrCodeLabel === event.event_code) {
              setPayload(null);
            }
            loadDashboard();
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Animated.View entering={FadeInDown.duration(400)} style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>
            {role === 'admin' ? 'Event Dashboard' : 'My Dashboard'}
          </Text>
          <Text style={styles.subtitle}>
            {role === 'admin'
              ? 'Campus-wide events, attendance and QR management.'
              : 'Create events, track attendance and manage QR codes.'}
          </Text>
        </View>
        <Pressable
          style={styles.refreshBtn}
          onPress={loadDashboard}
          disabled={listLoading}
        >
          <Ionicons name="refresh" size={16} color={COLORS.primary} />
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(60).duration(400)} style={styles.statsGrid}>
        <StatCard icon="people-outline" label="Students" value={stats.students} />
        <StatCard icon="calendar-outline" label="Events" value={stats.events} />
        <StatCard icon="radio-outline" label="Active" value={stats.active} />
        <StatCard icon="lock-closed-outline" label="Closed" value={stats.closed} />
        <StatCard icon="checkbox-outline" label="Records" value={stats.records} />
      </Animated.View>

      <AppButton
        theme="primary"
        title={formVisible ? 'Hide Event Form' : 'Create New Event'}
        icon={formVisible ? 'chevron-up-outline' : 'add-outline'}
        onPress={() => {
          if (formVisible) {
            setFormVisible(false);
            resetForm();
          } else {
            resetForm();
            setFormVisible(true);
          }
        }}
      />

      {message ? (
        <Text style={[styles.message, messageOk ? styles.messageOk : styles.messageErr]}>
          {message}
        </Text>
      ) : null}

      {payload ? (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.qrCard}>
          <View style={styles.qrHeader}>
            <Text style={styles.qrTitle}>Event QR</Text>
            <Pressable onPress={() => setPayload(null)} hitSlop={10}>
              <Ionicons name="close" size={20} color={COLORS.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.qrBox}>
            <QRCode value={payload} size={220} color="#000000" backgroundColor="#FFFFFF" />
          </View>
          <Text style={styles.eventCodeText}>{qrCodeLabel}</Text>
          <Text style={styles.hintText}>Students scan this in the Scan tab.</Text>
        </Animated.View>
      ) : null}

      {formVisible ? (
        <Animated.View entering={FadeInDown.duration(350)} style={styles.formWrap}>
          <Text style={styles.sectionTitle}>
            {editingId ? 'Edit Event' : 'Create Event'}
          </Text>

          <Text style={styles.label}>Event Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Founders Day Assembly"
            placeholderTextColor={COLORS.textSecondary}
          />

          <Text style={styles.label}>Event Code</Text>
          <TextInput
            style={[styles.input, editingId && styles.inputDisabled]}
            value={eventId}
            onChangeText={setEventId}
            placeholder="EVT-2026-0001"
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="characters"
            editable={!editingId}
          />
          {editingId ? (
            <Text style={styles.hintText}>
              The code is locked while editing because it is embedded in the QR.
            </Text>
          ) : null}

          <Text style={styles.label}>Venue</Text>
          <TextInput
            style={styles.input}
            value={venue}
            onChangeText={setVenue}
            placeholder="Gymnasium, Room 204, Oval..."
            placeholderTextColor={COLORS.textSecondary}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What is this event about?"
            placeholderTextColor={COLORS.textSecondary}
            multiline
          />

          <Text style={styles.label}>Start Time</Text>
          <Pressable
            style={styles.input}
            onPress={() => {
              setEditTarget('start');
              setEditingPart('date');
            }}
          >
            <Text style={styles.inputText}>{startDate.toLocaleString()}</Text>
          </Pressable>

          <Text style={styles.label}>End Time</Text>
          <Pressable
            style={styles.input}
            onPress={() => {
              setEditTarget('end');
              setEditingPart('date');
            }}
          >
            <Text style={styles.inputText}>{endDate.toLocaleString()}</Text>
          </Pressable>

          <View style={styles.chips}>
            {[30, 60, 120].map((minutes) => (
              <Pressable
                key={minutes}
                style={styles.chip}
                onPress={() => handleQuickDuration(minutes)}
              >
                <Text style={styles.chipText}>
                  +{minutes < 60 ? `${minutes} min` : `${minutes / 60} hour${minutes > 60 ? 's' : ''}`}
                </Text>
              </Pressable>
            ))}
          </View>

          {editTarget && (
            <DateTimePicker
              value={editTarget === 'start' ? startDate : endDate}
              mode={editingPart}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, selected) => {
                if (Platform.OS === 'android') {
                  if (editingPart === 'date' && selected) {
                    const cur = editTarget === 'start' ? startDate : endDate;
                    const next = new Date(cur);
                    next.setFullYear(
                      selected.getFullYear(),
                      selected.getMonth(),
                      selected.getDate()
                    );
                    if (editTarget === 'start') setStartDate(next);
                    else setEndDate(next);
                    setEditingPart('time');
                  } else {
                    if (selected) {
                      const cur = editTarget === 'start' ? startDate : endDate;
                      const next = new Date(cur);
                      next.setHours(selected.getHours(), selected.getMinutes());
                      if (editTarget === 'start') setStartDate(next);
                      else setEndDate(next);
                    }
                    setEditTarget(null);
                    setEditingPart('date');
                  }
                } else if (selected) {
                  if (editTarget === 'start') setStartDate(selected);
                  else setEndDate(selected);
                }
              }}
            />
          )}
          {Platform.OS === 'ios' && editTarget && (
            <AppButton
              title="Done"
              icon="checkmark-outline"
              onPress={() => setEditTarget(null)}
            />
          )}

          <AppButton
            theme="primary"
            title={saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Event'}
            icon={editingId ? 'save-outline' : 'add-outline'}
            onPress={handleSaveEvent}
            disabled={saving}
          />
          <AppButton
            title={editingId ? 'Cancel Edit' : 'Cancel'}
            icon="close-outline"
            onPress={() => {
              resetForm();
              setFormVisible(false);
            }}
          />
        </Animated.View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {role === 'admin' ? 'All Events' : 'My Events'}
        </Text>
        <Text style={styles.sectionCount}>{events.length}</Text>
      </View>

      {listLoading ? (
        <ActivityIndicator size="small" color={COLORS.primary} />
      ) : events.length === 0 ? (
        <Text style={styles.muted}>
          No events yet. Create your first event above.
        </Text>
      ) : (
        events.map((event, index) => {
          const phase = getEventPhase(event);
          const phaseStyle = PHASE_STYLES[phase];
          const busy = busyEventId === event.id;
          return (
            <Animated.View
              key={event.id}
              entering={FadeInDown.delay(Math.min(index, 6) * 60).duration(350)}
              style={styles.eventCard}
            >
              <View style={styles.eventHeader}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <View style={[styles.statusBadge, { backgroundColor: phaseStyle.backgroundColor }]}>
                  <Text style={[styles.statusText, { color: phaseStyle.color }]}>
                    {getEventPhaseLabel(phase)}
                  </Text>
                </View>
              </View>
              <Text style={styles.eventMeta}>{event.event_code}</Text>
              {event.venue ? (
                <Text style={styles.eventMeta}>{event.venue}</Text>
              ) : null}
              {event.start_time ? (
                <Text style={styles.eventMeta}>
                  {new Date(event.start_time).toLocaleString()}
                  {event.end_time
                    ? ` — ${new Date(event.end_time).toLocaleTimeString()}`
                    : ''}
                </Text>
              ) : null}
              <Text style={styles.eventMeta}>
                {counts[event.id] ?? 0} attendee(s)
              </Text>

              <View style={styles.eventActions}>
                <Pressable
                  style={styles.actionBtn}
                  disabled={busy}
                  onPress={() =>
                    router.push({
                      pathname: '/event/[id]',
                      params: { id: event.id },
                    })
                  }
                >
                  <Ionicons name="checkbox-outline" size={16} color={COLORS.primary} />
                  <Text style={[styles.actionText, styles.actionPrimary]}>
                    Attendance
                  </Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={() => handleShowQr(event)}>
                  <Ionicons name="qr-code-outline" size={16} color={COLORS.primary} />
                  <Text style={[styles.actionText, styles.actionPrimary]}>QR</Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={() => beginEdit(event)}>
                  <Ionicons name="create-outline" size={16} color={COLORS.primary} />
                  <Text style={[styles.actionText, styles.actionPrimary]}>Edit</Text>
                </Pressable>
                <Pressable
                  style={styles.actionBtn}
                  disabled={busy}
                  onPress={() => handleToggleStatus(event)}
                >
                  <Ionicons
                    name={event.status === 'closed' ? 'lock-open-outline' : 'lock-closed-outline'}
                    size={16}
                    color={event.status === 'closed' ? COLORS.success : COLORS.warning}
                  />
                  <Text
                    style={[
                      styles.actionText,
                      { color: event.status === 'closed' ? COLORS.success : COLORS.warning },
                    ]}
                  >
                    {event.status === 'closed' ? 'Reopen' : 'Close'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.actionBtn}
                  disabled={busy}
                  onPress={() => handleDelete(event)}
                >
                  <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                  <Text style={[styles.actionText, styles.actionDanger]}>Delete</Text>
                </Pressable>
              </View>
            </Animated.View>
          );
        })
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
      <Ionicons name={icon} size={20} color={COLORS.primary} />
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
    paddingTop: 24,
    gap: 12,
    paddingBottom: 48,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCard: {
    flexGrow: 1,
    minWidth: '30%',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
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
  message: {
    fontSize: 14,
    fontWeight: '600',
  },
  messageOk: {
    color: COLORS.success,
  },
  messageErr: {
    color: COLORS.danger,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  formWrap: {
    gap: 4,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputText: {
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  hintText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
  },
  chip: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  qrCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    gap: 10,
  },
  qrHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qrTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  qrBox: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventCodeText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  muted: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  eventCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 16,
    gap: 3,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  eventTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  eventMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  eventActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionPrimary: {
    color: COLORS.primary,
  },
  actionDanger: {
    color: COLORS.danger,
  },
});
