import { Alert, Platform } from "react-native";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

const getLocalFileUri = (filename: string) => {
  const baseDir = FileSystemLegacy.documentDirectory ?? FileSystemLegacy.cacheDirectory ?? "";
  return `${baseDir}${filename}`;
};

export async function saveArrayBufferExport(
  content: ArrayBuffer,
  filename: string,
  mimeType: string,
): Promise<void> {
  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return;
  }

  const fileUri = getLocalFileUri(filename);
  const base64 = Buffer.from(new Uint8Array(content)).toString("base64");

  await FileSystemLegacy.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystemLegacy.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType });
    return;
  }

  Alert.alert("Success", `File saved to: ${fileUri}`);
}
