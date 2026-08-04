import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useSettingsStore } from "../state/settingsStore";

type UseVoiceSearchOptions = {
  contextualStrings: string[];
  enabled: boolean;
  onTranscript: (transcript: string) => void;
};

export function useVoiceSearch({
  contextualStrings,
  enabled,
  onTranscript
}: UseVoiceSearchOptions) {
  const locale = useSettingsStore((state) => state.locale);
  const [isListening, setIsListening] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);

  useEffect(() => {
    if (!enabled) {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // Voice search can be unavailable on web or older builds.
      }
      setIsListening(false);
      return;
    }

    try {
      setIsAvailable(ExpoSpeechRecognitionModule.isRecognitionAvailable());
    } catch {
      setIsAvailable(false);
    }
  }, [enabled]);

  useSpeechRecognitionEvent("start", () => setIsListening(true));
  useSpeechRecognitionEvent("end", () => setIsListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript.trim();

    if (transcript) {
      onTranscript(transcript);
    }

    if (event.isFinal && Platform.OS === "web") {
      ExpoSpeechRecognitionModule.stop();
    }
  });
  useSpeechRecognitionEvent("error", () => {
    setIsListening(false);
  });

  async function toggle() {
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setIsAvailable(false);
        return;
      }

      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();

      if (!permission.granted) {
        setIsListening(false);
        setIsAvailable(false);
        return;
      }

      ExpoSpeechRecognitionModule.start({
        lang: locale,
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
        contextualStrings: contextualStrings.slice(0, 80),
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: "web_search"
        },
        iosTaskHint: "search"
      });
    } catch {
      setIsListening(false);
      setIsAvailable(false);
    }
  }

  return {
    isAvailable,
    isListening,
    toggle
  };
}
