import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  theme?: 'primary';
  onPress: () => void;
  disabled?: boolean;
};

export default function AppButton({
  title,
  icon,
  theme,
  onPress,
  disabled,
}: Props) {
  const isPrimary = theme === 'primary';
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 250 });
      }}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.buttonInner,
        isPrimary ? styles.primaryFill : styles.secondaryFill,
        animatedStyle,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.row}>
        <Ionicons
          name={icon}
          size={20}
          color={isPrimary ? COLORS.textOnPrimary : COLORS.primary}
        />
        <Text style={[styles.label, isPrimary && styles.labelPrimary]}>
          {title}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  buttonInner: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  primaryFill: {
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  secondaryFill: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  labelPrimary: {
    fontWeight: '700',
    color: COLORS.textOnPrimary,
  },
  disabled: {
    opacity: 0.5,
  },
});
