import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops! Not Found' }} />
      <View style={styles.container}>
        <Animated.Text
          entering={FadeInDown.duration(400)}
          style={styles.title}
        >
          Oops! Not Found
        </Animated.Text>
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <Link href="/(tabs)" style={styles.link}>
            Go back home
          </Link>
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  link: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: '600',
  },
});
