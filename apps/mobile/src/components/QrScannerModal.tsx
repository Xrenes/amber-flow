import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface QrScannerModalProps {
  visible: boolean;
  onScan: (data: string) => void;
  onClose: () => void;
}

// Full-screen camera modal for the "Mobile Check-in" QR flow (see
// TrackerScreen) — scans the code shown on the desktop app to start/pause/
// resume this agent's own Tracker session. Debounces repeated scans of the
// same frame with a ref (not state) so it doesn't fire the callback dozens
// of times a second while the code stays in frame.
export default function QrScannerModal({ visible, onScan, onClose }: QrScannerModalProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  React.useEffect(() => {
    if (visible) scannedRef.current = false;
  }, [visible]);

  function handleScan(result: BarcodeScanningResult) {
    if (scannedRef.current) return;
    scannedRef.current = true;
    onScan(result.data);
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.page}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleScan}
          />
        ) : (
          <View style={styles.permissionWrap}>
            <Feather name="camera-off" size={32} color={colors.textDim} />
            <Text style={styles.permissionText}>Amber Flow needs camera access to scan the check-in QR code.</Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
              <Text style={styles.permissionBtnText}>Allow Camera Access</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.overlay, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.hint}>Scan the QR code shown on your desktop app</Text>
        </View>

        {permission?.granted && (
          <View style={styles.frameWrap} pointerEvents="none">
            <View style={styles.frame} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    top: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    marginTop: 56,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  frameWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: 240,
    height: 240,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.accent,
  },
  permissionWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  permissionText: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  permissionBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12, marginTop: 6 },
  permissionBtnText: { color: '#1a0d00', fontWeight: '700', fontSize: 14 },
});
