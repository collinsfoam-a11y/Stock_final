import { Alert, Platform } from "react-native";

type FileSystemModule = typeof import("expo-file-system/legacy");
type SharingModule = typeof import("expo-sharing");

const loadNativeExportModules = async (): Promise<{
  FileSystem: FileSystemModule;
  Sharing: SharingModule;
}> => {
  const [FileSystem, Sharing] = await Promise.all([
    import("expo-file-system/legacy"),
    import("expo-sharing"),
  ]);
  return { FileSystem, Sharing };
};

const getLocalFileUri = (filename: string, FileSystem: FileSystemModule) => {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? "";
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

  const { FileSystem, Sharing } = await loadNativeExportModules();
  const fileUri = getLocalFileUri(filename, FileSystem);
  const base64 = Buffer.from(new Uint8Array(content)).toString("base64");

  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType });
    return;
  }

  Alert.alert("Success", `File saved to: ${fileUri}`);
}
