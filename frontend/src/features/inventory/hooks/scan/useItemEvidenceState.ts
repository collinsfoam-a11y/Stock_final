import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";

type DamageType = "returnable" | "nonreturnable";
type PhotoCaptureTarget = "damage" | "item" | null;

export const useItemEvidenceState = () => {
  const [remark, setRemark] = useState("");
  const [varianceRemark, setVarianceRemark] = useState("");
  const [isDamageEnabled, setIsDamageEnabled] = useState(false);
  const [damageQty, setDamageQty] = useState("");
  const [damageType, setDamageType] = useState<DamageType>("returnable");
  const [damagePhoto, setDamagePhoto] = useState<string | null>(null);
  const [itemPhotos, setItemPhotos] = useState<string[]>([]);
  const [photoCaptureVisible, setPhotoCaptureVisible] = useState(false);
  const [photoCaptureTarget, setPhotoCaptureTarget] =
    useState<PhotoCaptureTarget>(null);
  const photoCaptureTargetRef = useRef<PhotoCaptureTarget>(null);

  const openPhotoCapture = useCallback((target: Exclude<PhotoCaptureTarget, null>) => {
    photoCaptureTargetRef.current = target;
    setPhotoCaptureTarget(target);
    setPhotoCaptureVisible(true);
  }, []);

  const handleTakeDamagePhoto = useCallback(() => {
    openPhotoCapture("damage");
  }, [openPhotoCapture]);

  const handleAddItemPhoto = useCallback(() => {
    if (itemPhotos.length >= 3) {
      Alert.alert("Photo Limit", "Maximum 3 item photos can be attached.");
      return;
    }
    openPhotoCapture("item");
  }, [itemPhotos.length, openPhotoCapture]);

  const closePhotoCapture = useCallback(() => {
    photoCaptureTargetRef.current = null;
    setPhotoCaptureVisible(false);
    setPhotoCaptureTarget(null);
  }, []);

  const handlePhotoCaptured = useCallback(
    (photoUri: string) => {
      if (!photoUri) {
        closePhotoCapture();
        return;
      }

      const activeTarget = photoCaptureTargetRef.current;

      if (activeTarget === "damage") {
        setDamagePhoto(photoUri);
      } else if (activeTarget === "item") {
        setItemPhotos((previous) =>
          previous.length >= 3 ? previous : [...previous, photoUri],
        );
      }

      closePhotoCapture();
    },
    [closePhotoCapture],
  );

  const removeDamagePhoto = useCallback(() => {
    setDamagePhoto(null);
  }, []);

  const removeItemPhoto = useCallback((index: number) => {
    setItemPhotos((previous) => previous.filter((_, current) => current !== index));
  }, []);

  const resetEvidenceState = useCallback(() => {
    setRemark("");
    setVarianceRemark("");
    setIsDamageEnabled(false);
    setDamageQty("");
    setDamageType("returnable");
    setDamagePhoto(null);
    setItemPhotos([]);
    photoCaptureTargetRef.current = null;
    setPhotoCaptureVisible(false);
    setPhotoCaptureTarget(null);
  }, []);

  const photoCaptureTitle =
    photoCaptureTarget === "damage" ? "Capture Damage Photo" : "Capture Item Photo";

  return {
    closePhotoCapture,
    damagePhoto,
    damageQty,
    damageType,
    handlePhotoCaptured,
    handleAddItemPhoto,
    handleTakeDamagePhoto,
    isDamageEnabled,
    itemPhotos,
    photoCaptureTitle,
    photoCaptureVisible,
    remark,
    removeDamagePhoto,
    removeItemPhoto,
    resetEvidenceState,
    setDamageQty,
    setDamageType,
    setIsDamageEnabled,
    setRemark,
    setVarianceRemark,
    varianceRemark,
  };
};
