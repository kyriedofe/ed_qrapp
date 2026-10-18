import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { registerAttendance } from '@/lib/attendance';

export default function ScanScreen() {
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [lastData, setLastData] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const lockRef = useRef(false);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Camera Access Needed</Text>
        <Text style={styles.subtitle}>
          Grant camera permission to scan attendance QR codes.
        </Text>
        <AppButton
          theme="primary"
          title="Grant Permission"
          icon="camera-outline"
          onPress={requestPermission}
        />
      </View>
    );
  }

  const submitPayload = (raw: string) => {
    const data = raw.trim();
    if (!data || lockRef.current) return;
    lockRef.current = true;
    setScanned(true);
    setProcessing(true);
    setLastData(data);
    const studentId = user?.id ?? 'unknown';
    registerAttendance(data, studentId).then((result) => {
      setMessage(result.message);
      setSuccess(result.success);
      setProcessing(false);
    });
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    submitPayload(data);
  };

  const handleManualSubmit = () => {
    const code = manualCode.trim();
    if (!code) {
      setMessage('Enter the event code (e.g. EVT-2026-0001).');
      setSuccess(false);
      return;
    }
    // Fallback when the camera can't detect the code: build a v:1 payload
    // from the typed code. There is no start/end here, so there is no
    // time-window block — the event lookup + attendance insert still validate.
    submitPayload(JSON.stringify({ v: 1, event: code }));
  };

  const resetScanner = () => {
    lockRef.current = false;
    setScanned(false);
    setProcessing(false);
    setMessage(null);
    setLastData(null);
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />
      {/* Viewfinder frame — aim the QR code inside the box */}
      {!scanned && (
        <View style={styles.frameWrap} pointerEvents="none">
          <View style={styles.frame} />
          <Text style={styles.frameText}>
            Point the QR code inside the box
          </Text>
        </View>
      )}
      <View style={styles.overlay}>
        {message ? (
          <View style={styles.card}>
            <Text
              style={[styles.message, success ? styles.ok : styles.err]}
            >
              {processing ? 'Checking...' : message}
            </Text>
            {lastData ? (
              <Text style={styles.raw} numberOfLines={3}>
                {lastData}
              </Text>
            ) : null}
            <AppButton
              theme="primary"
              title="Scan Again"
              icon="scan-outline"
              onPress={resetScanner}
            />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.hint}>Point the camera at an event QR code</Text>
            <Text style={styles.or}>— or if it can't be scanned —</Text>
            <TextInput
              style={styles.input}
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="Enter event code"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="characters"
            />
            <AppButton
              theme="primary"
              title="Submit Code"
              icon="checkmark-outline"
              onPress={handleManualSubmit}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  camera: {
    flex: 1,
  },
  frameWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  frame: {
    width: 230,
    height: 230,
    borderWidth: 3,
    borderColor: COLORS.primary,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  frameText: {
    fontSize: 13,
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 16,
    gap: 10,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 24,
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  or: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
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
  message: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  ok: {
    color: COLORS.success,
  },
  err: {
    color: COLORS.danger,
  },
  raw: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
});
