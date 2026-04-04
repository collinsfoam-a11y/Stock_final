export interface BackendPhotoProof {
  id: string;
  url: string;
  timestamp: string;
}

export const toBackendPhotoProofs = (
  photoUris: string[],
  timestamp: string = new Date().toISOString()
): BackendPhotoProof[] => {
  return photoUris
    .map((uri) => (uri || "").trim())
    .filter((uri) => uri.length > 0)
    .map((uri, index) => ({
      id: `photo_${index + 1}`,
      url: uri,
      timestamp,
    }));
};
