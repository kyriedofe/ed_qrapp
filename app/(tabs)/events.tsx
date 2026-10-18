import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getAllEvents, type CloudEvent } from '@/lib/events';
import { supabase } from '@/lib/supabase';

export default function EventsScreen() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [attendedIds, setAttendedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // Which events have I already attended? (RLS: own rows only)
    const [allEvents, myAttendance] = await Promise.all([
      getAllEvents(),
      supabase.from('attendance').select('event_id').eq('student_id', user.id),
    ]);

    setEvents(allEvents);
    setAttendedIds(
      new Set(
        ((myAttendance.data ?? []) as { event_id: string }[]).map(
          (row) => row.event_id
        )
      )
    );
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
        <Text style={styles.muted}>Loading events...</Text>
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="calendar-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.title}>No events yet</Text>
        <Text style={styles.muted}>
          Check back later — teachers post events here.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={events}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<Text style={styles.screenTitle}>Available Events</Text>}
      renderItem={({ item }) => {
        const closed = item.status === 'closed';
        const attended = attendedIds.has(item.id);
        return (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <View
                style={[
                  styles.badge,
                  closed ? styles.badgeClosed : styles.badgeOpen,
                ]}
              >
                <Text style={styles.badgeText}>
                  {closed ? 'Closed' : 'Open'}
                </Text>
              </View>
            </View>

            <Text style={styles.meta}>{item.event_code}</Text>
            {item.venue ? (
              <Text style={styles.meta}>📍 {item.venue}</Text>
            ) : null}
            {item.start_time ? (
              <Text style={styles.meta}>
                🕒 {new Date(item.start_time).toLocaleString()}
                {item.end_time
                  ? ` — ${new Date(item.end_time).toLocaleTimeString()}`
                  : ''}
              </Text>
            ) : null}
            {item.description ? (
              <Text style={styles.description}>{item.description}</Text>
            ) : null}

            {attended ? (
              <View style={styles.attendedRow}>
                <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                <Text style={styles.attendedText}>You attended this event</Text>
              </View>
            ) : null}
          </View>
        );
      }}
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
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeOpen: {
    backgroundColor: COLORS.success,
  },
  badgeClosed: {
    backgroundColor: COLORS.danger,
  },
  badgeText: {
    color: COLORS.textOnPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  meta: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  description: {
    fontSize: 14,
    color: COLORS.textPrimary,
    marginTop: 4,
    lineHeight: 20,
  },
  attendedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  attendedText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.success,
  },
});
