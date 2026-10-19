import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';

type Props = {
  title: string;
};

export default function Header({ title }: Props) {
  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.container}>
      <View style={styles.logoCircle}>
        <MaterialIcons
          name="qr-code-scanner"
          size={36}
          color={COLORS.primary}
        />
      </View>
      <Text style={styles.title}>{title}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});
