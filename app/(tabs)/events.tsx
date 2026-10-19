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

import EventCard from '@/components/EventCard';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  getAllEvents,
  getEventPhase,
  type CloudEvent,
  type EventPhase,
} from '@/lib/events';
import { getStudentAttendedEventIds } from '@/lib/attendance';

type Filter = 'all' | EventPhase;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'closed', label: 'Closed' },
];

export default function EventsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [attendedIds, setAttendedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [allEvents, attended] = await Promise.all([
      getAllEvents(),
      getStudentAttendedEventIds(user.id),
    ]);
    setEvents(allEvents);
    setAttendedIds(attended);
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
        <Text style={styles.muted}>Loading events...</Text>
      </Animated.View>
    );
  }

  if (events.length === 0) {
    return (
      <Animated.View entering={FadeInDown.duration(400)} style={styles.centered}>
        <Ionicons name="calendar-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.title}>No events yet</Text>
        <Text style={styles.muted}>
          Check back later — teachers post events here.
        </Text>
      </Animated.View>
    );
  }

  const visibleEvents =
    filter === 'all'
      ? events
      : events.filter((event) => getEventPhase(event) === filter);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={visibleEvents}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.headerWrap}>
          <Animated.Text
            entering={FadeInDown.duration(400)}
            style={styles.screenTitle}
          >
            Available Events
          </Animated.Text>
          <View style={styles.filterRow}>
            {FILTERS.map((item) => (
              <Pressable
                key={item.key}
                style={[
                  styles.chip,
                  filter === item.key && styles.chipActive,
                ]}
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
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.muted}>No {filter} events right now.</Text>
      }
      renderItem={({ item, index }) => (
        <EventCard
          event={item}
          attended={attendedIds.has(item.id)}
          index={index}
          onPress={() =>
            router.push({
              pathname: '/event/[id]',
              params: { id: item.id },
            })
          }
        />
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
    paddingTop: 20,
    paddingBottom: 40,
    gap: 12,
  },
  headerWrap: {
    gap: 10,
    marginBottom: 4,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
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
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.textOnPrimary,
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
});
