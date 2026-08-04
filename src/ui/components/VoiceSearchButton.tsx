import { StyleSheet, TouchableOpacity, View } from "react-native";

type VoiceSearchButtonProps = {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  isListening: boolean;
  onPress: () => void;
};

export function VoiceSearchButton({
  accessibilityHint = "Toca para iniciar ou parar a pesquisa por voz.",
  accessibilityLabel = "Pesquisa por voz",
  isListening,
  onPress
}: VoiceSearchButtonProps) {
  return (
    <TouchableOpacity
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={[
        styles.voiceSearchButton,
        isListening && styles.voiceSearchButtonActive
      ]}
      onPress={onPress}
    >
      <View style={styles.microphoneIcon}>
        <View style={[styles.microphoneHead, isListening && styles.microphoneIconActive]} />
        <View style={[styles.microphoneStem, isListening && styles.microphoneIconActive]} />
        <View style={[styles.microphoneBase, isListening && styles.microphoneIconActive]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  voiceSearchButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 36,
    paddingHorizontal: 8
  },
  voiceSearchButtonActive: {
    opacity: 0.75
  },
  microphoneIcon: {
    alignItems: "center",
    height: 26,
    justifyContent: "center",
    width: 20
  },
  microphoneHead: {
    borderColor: "#12616F",
    borderRadius: 6,
    borderWidth: 2,
    height: 16,
    width: 12
  },
  microphoneStem: {
    backgroundColor: "#12616F",
    height: 6,
    width: 2
  },
  microphoneBase: {
    backgroundColor: "#12616F",
    borderRadius: 1,
    height: 2,
    width: 14
  },
  microphoneIconActive: {
    backgroundColor: "#A33E22",
    borderColor: "#A33E22"
  }
});
