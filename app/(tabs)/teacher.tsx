import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';
import {
  createEvent,
  getEventsByTeacher,
  setEventStatus,
  updateEvent,
  type CloudEvent,
} from '@/lib/events';
import { getTeacherEventSummary } from '@/lib/attendance';
import { buildQRPayload } from '@/lib/qr';

export default function TeacherScreen() {
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 60 * 60 * 1000)
  );
  const [editTarget, setEditTarget] = useState<'start' | 'end' | null>(null);
  const [editingPart, setEditingPart] = useState<'date' | 'time'>('date');
  const [payload, setPayload] = useState<string | null>(null);
  const [qrCodeLabel, setQrCodeLabel] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [myEvents, setMyEvents] = useState<CloudEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [listLoading, setListLoading] = useState(false);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);

  const isStaff = role === 'teacher' || role === 'admin';

  const loadEvents = useCallback(async () => {
    if (!user) return;
    setListLoading(true);
    const [events, summary] = await Promise.all([
      getEventsByTeacher(user.id),
      getTeacherEventSummary(user.id),
    ]);
    setMyEvents(events);
    const map: Record<string, number> = {};
    summary.forEach((s) => {
      map[s.eventId] = s.attendeeCount;
    });
    setCounts(map);
    setListLoading(false);
  }, [user]);

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
      if (user && isStaff) {
        loadEvents();
      }
    }, [user, isStaff, loadEvents])
  );

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
        <Ionicons
          name="lock-closed-outline"
          size={48}
          color={COLORS.textSecondary}
        />
        <Text style={styles.title}>Teachers Only</Text>
        <Text style={styles.muted}>
          Only teacher and administrator accounts can create events.
        </Text>
      </View>
    );
  }

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setEventId('');
    setVenue('');
    setDescription('');
    setStartDate(new Date());
    setEndDate(new Date(Date.now() + 60 * 60 * 1000));
    setPayload(null);
    setMessage(null);
  };

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
          : 'Event saved! Scan the QR with the Scan tab to test it.'
      );
      setMessageOk(true);
      setPayload(buildQRPayload(eventData));
      setQrCodeLabel(eventData.eventId);
      setEditingId(null);
      loadEvents();
    });
  };

  const handleEdit = (event: CloudEvent) => {
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
    setMessage(null);
  };

  const handleToggleStatus = async (event: CloudEvent) => {
    const next = event.status === 'open' ? 'closed' : 'open';
    setBusyEventId(event.id);
    const { error } = await setEventStatus(event.id, next);
    setBusyEventId(null);
    if (error) {
      setMessage(`Could not ${next === 'closed' ? 'close' : 'reopen'} event.`);
      setMessageOk(false);
      return;
    }
    setMessage(
      next === 'closed'
        ? `"${event.title}" is now closed — scanning is blocked.`
        : `"${event.title}" is open again.`
    );
    setMessageOk(true);
    loadEvents();
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>
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
          setEditingPart(Platform.OS === 'ios' ? 'date' : 'date');
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
        <Pressable
          style={styles.chip}
          onPress={() => handleQuickDuration(30)}
        >
          <Text style={styles.chipText}>+30 min</Text>
        </Pressable>
        <Pressable
          style={styles.chip}
          onPress={() => handleQuickDuration(60)}
        >
          <Text style={styles.chipText}>+1 hour</Text>
        </Pressable>
        <Pressable
          style={styles.chip}
          onPress={() => handleQuickDuration(120)}
        >
          <Text style={styles.chipText}>+2 hours</Text>
        </Pressable>
      </View>

      {editTarget && (
        <DateTimePicker
          value={editTarget === 'start' ? startDate : endDate}
          mode={editingPart}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, selected) => {
            if (Platform.OS === 'android') {
              if (editingPart === 'date' && selected) {
                const cur =
                  editTarget === 'start' ? startDate : endDate;
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
                  const cur =
                    editTarget === 'start' ? startDate : endDate;
                  const next = new Date(cur);
                  next.setHours(
                    selected.getHours(),
                    selected.getMinutes()
                  );
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

      {message && (
        <Text style={[styles.message, messageOk ? styles.messageOk : styles.messageErr]}>
          {message}
        </Text>
      )}

      <AppButton
        theme="primary"
        title={saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Event'}
        icon={editingId ? 'save-outline' : 'add-outline'}
        onPress={handleSaveEvent}
        disabled={saving}
      />
      {editingId ? (
        <AppButton title="Cancel Edit" icon="close-outline" onPress={resetForm} />
      ) : null}

      {payload && (
        <View style={styles.qrCard}>
          {/* White quiet-zone box — easier for the camera to scan when the QR has a light border */}
          <View style={styles.qrBox}>
            <QRCode value={payload} size={220} color="#000000" backgroundColor="#FFFFFF" />
          </View>
          <Text style={styles.eventCodeText}>{qrCodeLabel}</Text>
          <Text style={styles.payloadText}>{payload}</Text>
        </View>
      )}

      {/* ---------------- My Events (View / Edit / Close) ---------------- */}
      <Text style={styles.sectionTitle}>My Events</Text>
      {listLoading ? (
        <ActivityIndicator size="small" color={COLORS.primary} />
      ) : myEvents.length === 0 ? (
        <Text style={styles.muted}>
          No events yet. Create your first event above.
        </Text>
      ) : (
        myEvents.map((event) => {
          const closed = event.status === 'closed';
          return (
            <View key={event.id} style={styles.eventCard}>
              <View style={styles.eventHeader}>
                <Text style={styles.eventTitle}>{event.title}</Text>
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
              <Text style={styles.eventMeta}>{event.event_code}</Text>
              {event.venue ? (
                <Text style={styles.eventMeta}>📍 {event.venue}</Text>
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
                  onPress={() => handleShowQr(event)}
                >
                  <Ionicons name="qr-code-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.actionText}>QR</Text>
                </Pressable>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => handleEdit(event)}
                >
                  <Ionicons name="create-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, closed && styles.actionBtnOpen]}
                  onPress={() => handleToggleStatus(event)}
                  disabled={busyEventId === event.id}
                >
                  <Ionicons
                    name={closed ? 'lock-open-outline' : 'lock-closed-outline'}
                    size={16}
                    color={closed ? COLORS.success : COLORS.danger}
                  />
                  <Text
                    style={[
                      styles.actionText,
                      { color: closed ? COLORS.success : COLORS.danger },
                    ]}
                  >
                    {busyEventId === event.id
                      ? '...'
                      : closed
                        ? 'Reopen'
                        : 'Close'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 20,
    gap: 4,
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
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 24,
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.card,
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
    backgroundColor: COLORS.card,
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
  message: {
    fontSize: 14,
    marginVertical: 8,
  },
  messageOk: {
    color: COLORS.success,
    fontWeight: '600',
  },
  messageErr: {
    color: COLORS.danger,
    fontWeight: '600',
  },
  qrCard: {
    marginTop: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    gap: 12,
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
  payloadText: {
    fontSize: 11,
    color: COLORS.textSecondary,
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
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
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
  statusOpen: {
    backgroundColor: COLORS.success,
  },
  statusClosed: {
    backgroundColor: COLORS.danger,
  },
  statusText: {
    color: COLORS.textOnPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  eventMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  eventActions: {
    flexDirection: 'row',
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
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  actionBtnOpen: {
    borderColor: COLORS.success,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.danger,
  },
});
