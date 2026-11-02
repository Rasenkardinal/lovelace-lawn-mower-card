import type { MapAdjustment } from "./map-georeference-logic";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_STORED_BYTES = 2 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = 2_800_000;
const MAX_DIMENSION = 4096;
const MAX_SOURCE_PIXELS = 40_000_000;
const JPEG_PREFIX = "data:image/jpeg;base64,";
const JPEG_DATA_URL = /^data:image\/jpeg;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function readDroneBackgroundImage(value: unknown): string | undefined {
  return typeof value === "string" &&
    value.length <= MAX_DATA_URL_LENGTH &&
    value.length > JPEG_PREFIX.length &&
    JPEG_DATA_URL.test(value)
    ? value
    : undefined;
}

export function readDroneMapAdjustment(value: unknown): MapAdjustment | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const { dx, dy, rotation, scale } = data;
  if (typeof dx !== "number" || !Number.isFinite(dx) || Math.abs(dx) > 1_000_000 ||
      typeof dy !== "number" || !Number.isFinite(dy) || Math.abs(dy) > 1_000_000 ||
      typeof rotation !== "number" || !Number.isFinite(rotation) || Math.abs(rotation) > 360_000 ||
      typeof scale !== "number" || !Number.isFinite(scale) ||
      scale < 0.25 || scale > 4) return undefined;
  return { dx, dy, rotation, scale };
}

export async function encodeDroneBackgroundImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Unsupported image format");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Image exceeds the upload limit");
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = objectUrl;
    await image.decode();
  } catch {
    throw new Error("The selected image could not be decoded");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  if (!image.naturalWidth || !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > MAX_SOURCE_PIXELS) {
    throw new Error("Image dimensions are not supported");
  }

  let scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
  );
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the image");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86),
    );
    if (!blob) throw new Error("Could not compress the image");
    if (blob.size <= MAX_STORED_BYTES) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("Could not read the compressed image"));
        reader.onerror = () => reject(new Error("Could not read the compressed image"));
        reader.readAsDataURL(blob);
      });
      if (readDroneBackgroundImage(dataUrl)) return dataUrl;
      throw new Error("The compressed image is invalid");
    }
    scale *= 0.75;
  }
  throw new Error("The image could not be compressed enough to save in the dashboard");
}
