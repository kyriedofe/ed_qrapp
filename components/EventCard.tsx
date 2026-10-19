import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';
import {
  getEventPhase,
  getEventPhaseLabel,
  type CloudEvent,
  type EventPhase,
} from '@/lib/events';

type Props = {
  event: CloudEvent;
  attended: boolean;
  index?: number;
  onPress: () => void;
};

function formatSchedule(event: CloudEvent): string {
  if (!event.start_time) return 'Schedule to be announced';

  const start = new Date(event.start_time);
  const date = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const startTime = start.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (!event.end_time) return `${date} • ${startTime}`;

  const endTime = new Date(event.end_time).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date} • ${startTime} - ${endTime}`;
}

function attendanceLabel(
  attended: boolean,
  phase: EventPhase
): { text: string; backgroundColor: string; color: string } {
  if (attended) {
    return {
      text: 'Attendance Recorded',
      backgroundColor: COLORS.success,
      color: COLORS.textOnPrimary,
    };
  }
  if (phase === 'upcoming') {
    return {
      text: 'Upcoming Event',
      backgroundColor: COLORS.warning,
      color: COLORS.background,
    };
  }
  if (phase === 'ongoing') {
    return {
      text: 'Attendance Open',
      backgroundColor: COLORS.primary,
      color: COLORS.textOnPrimary,
    };
  }
  return {
    text: 'Event Closed',
    backgroundColor: COLORS.surface,
    color: COLORS.textSecondary,
  };
}

export default function EventCard({ event, attended, index = 0, onPress }: Props) {
  const phase = getEventPhase(event);
  const label = attendanceLabel(attended, phase);

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 60).duration(350)}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{event.title}</Text>
          <View style={[styles.badge, { backgroundColor: label.backgroundColor }]}>
            <Text style={[styles.badgeText, { color: label.color }]}>
              {label.text}
            </Text>
          </View>
        </View>

        {event.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {event.description}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
          <Text style={styles.meta}>{formatSchedule(event)}</Text>
        </View>

        {event.venue ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.meta}>{event.venue}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.code}>
            {event.event_code} • {getEventPhaseLabel(phase)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  pressed: {
    opacity: 0.8,
    borderColor: COLORS.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '55%',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  meta: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  code: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.4,
  },
});
