"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ASSET_DISPLAY_PRESETS,
  ASSET_UPLOAD_PRESET_OPTIONS,
  getAssetDisplayPreset
} from "@/lib/asset-display";
import { getImageFileFromTransfer, hasImageFileInTransfer } from "@/lib/image-transfer";
import { FramedImage } from "@/components/ui/framed-image";
import type { Asset, AssetKind } from "@/modules/domain/types";

interface InlineAssetUploadProps {
  kind: AssetKind;
  onUploaded: (asset: Asset) => void;
  currentAsset?: Asset | null;
  onClear?: () => void;
  buttonLabel?: string;
  editButtonLabel?: string;
  clearButtonLabel?: string;
  emptyLabel?: string;
  helperText?: string;
  dataTestId?: string;
}

interface CropSession {
  baseName: string;
  imageUrl: string;
  originalFile: File;
  width: number;
  height: number;
  existingAsset?: Asset;
}

interface CropBoxSize {
  width: number;
  height: number;
}

interface CropOffset {
  x: number;
  y: number;
}

const ZOOM_SLIDER_MAX = 1000;
const ZOOM_SLIDER_CURVE = 1.85;

function getUploadErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "上传请求失败，请检查网络连接或 R2 存储配置。";
    }

    return error.message;
  }

  return "上传失败。";
}

function clampOffset(
  offset: CropOffset,
  imageWidth: number,
  imageHeight: number,
  cropBox: CropBoxSize,
  scale: number
) {
  const scaledWidth = imageWidth * scale;
  const scaledHeight = imageHeight * scale;
  const maxX = Math.max(0, (scaledWidth - cropBox.width) / 2);
  const maxY = Math.max(0, (scaledHeight - cropBox.height) / 2);

  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y))
  };
}

function replaceFileExtension(fileName: string, extension: string) {
  const normalizedExtension = extension.startsWith(".") ? extension : `.${extension}`;
  return fileName.replace(/\.[^.]+$/, "") + normalizedExtension;
}

function getSafeAssetBaseName(asset: Asset) {
  return asset.title.trim() || "未命名图片";
}

function scaleToSliderValue(scale: number, minScale: number, maxScale: number) {
  if (maxScale <= minScale) {
    return 0;
  }

  const progress = (scale - minScale) / (maxScale - minScale);
  const normalizedProgress = Math.min(1, Math.max(0, progress));
  return Math.round(Math.pow(normalizedProgress, 1 / ZOOM_SLIDER_CURVE) * ZOOM_SLIDER_MAX);
}

function sliderValueToScale(value: number, minScale: number, maxScale: number) {
  if (maxScale <= minScale) {
    return minScale;
  }

  const normalizedValue = Math.min(ZOOM_SLIDER_MAX, Math.max(0, value)) / ZOOM_SLIDER_MAX;
  return minScale + (maxScale - minScale) * Math.pow(normalizedValue, ZOOM_SLIDER_CURVE);
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取图片，请更换图片重试。"));
    image.src = src;
  });
}

async function createCropSession(file: File) {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageElement(imageUrl);
    const baseName = file.name.replace(/\.[^.]+$/, "").trim() || "未命名图片";

    return {
      baseName,
      imageUrl,
      originalFile: file,
      width: image.naturalWidth,
      height: image.naturalHeight
    } satisfies CropSession;
  } catch (error) {
    URL.revokeObjectURL(imageUrl);
    throw error;
  }
}

async function prepareSourceFile(file: File) {
  const session = await createCropSession(file);
  if (Math.max(session.width, session.height) <= 3200) return session;

  const image = await loadImageElement(session.imageUrl);
  const ratio = 3200 / Math.max(session.width, session.height);
  const width = Math.round(session.width * ratio);
  const height = Math.round(session.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return session;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
  if (!blob) return session;
  URL.revokeObjectURL(session.imageUrl);
  return createCropSession(new File([blob], replaceFileExtension(file.name, ".webp"), { type: "image/webp" }));
}

async function createCropSessionFromExistingAsset(asset: Asset) {
  const image = await loadImageElement(asset.url);

  return {
    imageUrl: asset.url,
    originalFile: new File([], getSafeAssetBaseName(asset)),
    width: image.naturalWidth || asset.width,
    height: image.naturalHeight || asset.height,
    baseName: getSafeAssetBaseName(asset),
    existingAsset: asset
  } satisfies CropSession;
}

export function InlineAssetUpload({
  kind,
  onUploaded,
  currentAsset = null,
  onClear,
  editButtonLabel = "编辑当前图片",
  buttonLabel = "上传本地图片",
  clearButtonLabel = "清空当前图片",
  emptyLabel = "当前未上传图片",
  helperText,
  dataTestId
}: InlineAssetUploadProps) {
  const defaultPreset = useMemo(() => ASSET_DISPLAY_PRESETS[kind], [kind]);
  const uploadPresets = useMemo(() => ASSET_UPLOAD_PRESET_OPTIONS[kind], [kind]);
  const uploadSurfaceRef = useRef<HTMLDivElement | null>(null);
  const cropFrameRef = useRef<HTMLDivElement | null>(null);
  const dragDepthRef = useRef(0);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originOffset: CropOffset;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [preparingCrop, setPreparingCrop] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [cropSession, setCropSession] = useState<CropSession | null>(null);
  const [cropBox, setCropBox] = useState<CropBoxSize | null>(null);
  const [offset, setOffset] = useState<CropOffset>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [selectedRatioLabel, setSelectedRatioLabel] = useState(defaultPreset.ratioLabel);

  const selectedPreset = useMemo(
    () => uploadPresets.find((preset) => preset.ratioLabel === selectedRatioLabel) ?? defaultPreset,
    [defaultPreset, selectedRatioLabel, uploadPresets]
  );
  const preset = selectedPreset;
  const previewPreset = useMemo(() => getAssetDisplayPreset(kind, currentAsset), [currentAsset, kind]);
  const supportedRatioText = useMemo(
    () => uploadPresets.map((preset) => preset.ratioLabel).join(" / "),
    [uploadPresets]
  );

  const minScale = useMemo(() => {
    if (!cropSession || !cropBox) {
      return 1;
    }

    return Math.max(cropBox.width / cropSession.width, cropBox.height / cropSession.height);
  }, [cropBox, cropSession]);
  const safeScale = Math.max(scale, minScale);
  const maxScale = Math.max(minScale * 4, minScale + 1.5);
  const zoomSliderValue = useMemo(
    () => scaleToSliderValue(safeScale, minScale, maxScale),
    [maxScale, minScale, safeScale]
  );
  const isBusy = pending || preparingCrop;

  useEffect(() => {
    setSelectedRatioLabel(defaultPreset.ratioLabel);
  }, [defaultPreset.ratioLabel]);

  useEffect(() => {
    if (!cropSession) {
      return;
    }

    return () => {
      URL.revokeObjectURL(cropSession.imageUrl);
    };
  }, [cropSession]);

  useEffect(() => {
    if (!cropSession) {
      setCropBox(null);
      return;
    }

    const node = cropFrameRef.current;
    if (!node) {
      return;
    }

    const updateCropBox = () => {
      setCropBox({
        width: node.clientWidth,
        height: node.clientHeight
      });
    };

    updateCropBox();

    const resizeObserver = new ResizeObserver(updateCropBox);
    resizeObserver.observe(node);

    return () => {
      resizeObserver.disconnect();
    };
  }, [cropSession]);

  useEffect(() => {
    if (!cropSession || !cropBox) {
      return;
    }

    const asset = cropSession.existingAsset;
    if (!asset) {
      setOffset({ x: 0, y: 0 });
      setScale(minScale);
      return;
    }
    const cropWidth = asset.cropWidth ?? 1;
    const cropHeight = asset.cropHeight ?? 1;
    const nextScale = Math.max(
      cropBox.width / (cropWidth * cropSession.width),
      cropBox.height / (cropHeight * cropSession.height)
    );
    const displayedWidth = cropSession.width * nextScale;
    const displayedHeight = cropSession.height * nextScale;
    setScale(nextScale);
    setOffset({
      x: -(asset.cropX ?? 0) * displayedWidth - (cropBox.width - displayedWidth) / 2,
      y: -(asset.cropY ?? 0) * displayedHeight - (cropBox.height - displayedHeight) / 2
    });
  }, [cropBox, cropSession, minScale]);

  useEffect(() => {
    if (!cropSession || !cropBox) {
      return;
    }

    setOffset((current) => clampOffset(current, cropSession.width, cropSession.height, cropBox, safeScale));
  }, [cropBox, cropSession, safeScale]);

  async function uploadPreparedFile(file: File, width: number, height: number, baseName: string, framing: Asset) {
    let directUploadCompleted = false;
    try {
      const signatureResponse = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type || "application/octet-stream" })
      });
      const signature = (await signatureResponse.json().catch(() => null)) as {
        mode?: "mock" | "r2"; uploadUrl?: string | null; publicUrl?: string | null; objectKey?: string | null;
      } | null;
      if (signatureResponse.ok && signature?.mode === "r2" && signature.uploadUrl && signature.publicUrl && signature.objectKey) {
        let uploadResponse: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          uploadResponse = await fetch(signature.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file
          }).catch(() => null);
          if (uploadResponse?.ok) break;
          await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
        }
        if (!uploadResponse?.ok) throw new Error("直传失败");
        directUploadCompleted = true;
        const metadataResponse = await fetch("/api/admin/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind, title: baseName, alt: baseName, width, height,
            url: signature.publicUrl, objectKey: signature.objectKey,
            cropX: framing.cropX, cropY: framing.cropY, cropWidth: framing.cropWidth, cropHeight: framing.cropHeight,
            displayAspectWidth: framing.displayAspectWidth, displayAspectHeight: framing.displayAspectHeight
          })
        });
        const metadata = (await metadataResponse.json().catch(() => null)) as { error?: string; asset?: Asset } | null;
        if (!metadataResponse.ok || !metadata?.asset) throw new Error(metadata?.error ?? "素材信息保存失败。");
        onUploaded(metadata.asset);
        setMessage(`已上传 ${metadata.asset.title}`);
        return;
      }
    } catch (error) {
      if (directUploadCompleted) throw error;
    }

    const formData = new FormData();

    formData.set("file", file);
    formData.set("kind", kind);
    formData.set("title", baseName);
    formData.set("alt", baseName);
    formData.set("width", String(width));
    formData.set("height", String(height));
    formData.set("cropX", String(framing.cropX));
    formData.set("cropY", String(framing.cropY));
    formData.set("cropWidth", String(framing.cropWidth));
    formData.set("cropHeight", String(framing.cropHeight));
    formData.set("displayAspectWidth", String(framing.displayAspectWidth));
    formData.set("displayAspectHeight", String(framing.displayAspectHeight));

    const response = await fetch("/api/admin/assets", {
      method: "POST",
      body: formData
    });
    const data = (await response.json().catch(() => null)) as { error?: string; asset?: Asset } | null;

    if (response.status === 401) {
      throw new Error("登录已失效，请重新登录后再上传。");
    }

    if (!response.ok || !data?.asset) {
      throw new Error(data?.error ?? "上传失败。");
    }

    onUploaded(data.asset);
    setMessage(`已上传 ${data.asset.title}`);
  }

  async function handleChange(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("请选择可识别的图片文件。");
      return;
    }

    setMessage(null);

    try {
      setSelectedRatioLabel(defaultPreset.ratioLabel);
      const nextCropSession = await prepareSourceFile(file);
      setCropSession(nextCropSession);
    } catch (error) {
      setMessage(getUploadErrorMessage(error));
    }
  }

  async function handleEditCurrentAsset() {
    if (!currentAsset || isBusy) {
      return;
    }

    setPreparingCrop(true);
    setMessage(null);

    try {
      setSelectedRatioLabel(getAssetDisplayPreset(kind, currentAsset).ratioLabel);
      const nextCropSession = await createCropSessionFromExistingAsset(currentAsset);
      setCropSession(nextCropSession);
    } catch (error) {
      setMessage(getUploadErrorMessage(error));
    } finally {
      setPreparingCrop(false);
    }
  }

  function handleUploadSurfacePointerDownCapture(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest("button, input, textarea, select, a")) {
      return;
    }

    uploadSurfaceRef.current?.focus();
  }

  function handleDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (isBusy) {
      return;
    }

    const hasImageFile = hasImageFileInTransfer(event.dataTransfer);
    if (!hasImageFile) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDropActive(true);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (isBusy || !hasImageFileInTransfer(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!isDropActive) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDropActive(false);
    }
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    const file = getImageFileFromTransfer(event.dataTransfer);
    if (!file || isBusy) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDropActive(false);
    await handleChange(file);
  }

  async function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    if (isBusy) {
      return;
    }

    const file = getImageFileFromTransfer(event.clipboardData, {
      fallbackBaseName: "pasted-image"
    });
    if (!file) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDropActive(false);
    await handleChange(file);
  }

  function closeCropSession() {
    setCropSession(null);
    setCropBox(null);
    setOffset({ x: 0, y: 0 });
    setScale(1);
    setSelectedRatioLabel(defaultPreset.ratioLabel);
  }

  async function handleConfirmCrop() {
    if (!cropSession || !cropBox) {
      return;
    }

    setPending(true);
    setMessage(null);

    try {
      const displayedWidth = cropSession.width * safeScale;
      const displayedHeight = cropSession.height * safeScale;
      const imageLeft = (cropBox.width - displayedWidth) / 2 + offset.x;
      const imageTop = (cropBox.height - displayedHeight) / 2 + offset.y;
      const framing = {
        cropX: Math.max(0, -imageLeft / safeScale / cropSession.width),
        cropY: Math.max(0, -imageTop / safeScale / cropSession.height),
        cropWidth: Math.min(1, cropBox.width / safeScale / cropSession.width),
        cropHeight: Math.min(1, cropBox.height / safeScale / cropSession.height),
        displayAspectWidth: preset.aspectWidth,
        displayAspectHeight: preset.aspectHeight
      } as Asset;
      if (cropSession.existingAsset) {
        const response = await fetch("/api/admin/assets", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId: cropSession.existingAsset.id, ...framing })
        });
        const data = (await response.json().catch(() => null)) as { error?: string; asset?: Asset } | null;
        if (!response.ok || !data?.asset) throw new Error(data?.error ?? "保存取景失败。");
        onUploaded(data.asset);
        setMessage(`已更新 ${data.asset.title} 的显示区域`);
      } else {
        await uploadPreparedFile(
          cropSession.originalFile,
          cropSession.width,
          cropSession.height,
          cropSession.baseName,
          framing
        );
      }
      closeCropSession();
    } catch (error) {
      setMessage(getUploadErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  function handleCropPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!cropSession || !cropBox || isBusy) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originOffset: offset
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCropPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!cropSession || !cropBox) {
      return;
    }

    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextOffset = clampOffset(
      {
        x: dragState.originOffset.x + (event.clientX - dragState.startX),
        y: dragState.originOffset.y + (event.clientY - dragState.startY)
      },
      cropSession.width,
      cropSession.height,
      cropBox,
      safeScale
    );

    setOffset(nextOffset);
  }

  function handleCropPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <>
      <div
        ref={uploadSurfaceRef}
        data-testid={dataTestId ? `${dataTestId}-surface` : undefined}
        tabIndex={isBusy ? -1 : 0}
        aria-label="图片上传区域，支持选择、拖拽或粘贴图片"
        className={`flex flex-wrap items-center gap-3 rounded-[1.3rem] outline-none transition focus-visible:ring-2 focus-visible:ring-[rgba(43,109,246,0.28)] ${
          isDropActive ? "border border-dashed border-[var(--color-accent)] bg-[rgba(43,109,246,0.08)] p-3" : ""
        }`}
        onPointerDownCapture={handleUploadSurfacePointerDownCapture}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        <div className="w-full max-w-xs overflow-hidden rounded-[1.2rem] border border-white/10 bg-black/20">
          <div className="relative" style={{ aspectRatio: previewPreset.aspectStyle }}>
            {currentAsset ? (
              <FramedImage asset={currentAsset} sizes="20rem" />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),rgba(255,255,255,0.03)_45%,rgba(0,0,0,0.45))]" />
            )}
          </div>
          <div className="border-t border-white/10 px-3 py-2 text-xs text-white/52">
            {currentAsset ? currentAsset.title : emptyLabel}
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center rounded-full border border-white/12 px-3 py-2 text-xs text-white/72 transition hover:border-white/25 hover:text-white">
          <input
            data-testid={dataTestId}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={isBusy}
            onChange={async (event) => {
              const input = event.currentTarget;
              const file = event.target.files?.[0] ?? null;
              await handleChange(file);
              input.value = "";
            }}
          />
          {isBusy ? "处理中..." : buttonLabel}
        </label>
        {currentAsset ? (
          <button
            type="button"
            data-testid={dataTestId ? `${dataTestId}-edit` : undefined}
            onClick={handleEditCurrentAsset}
            disabled={isBusy}
            className="ui-button-secondary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-45"
          >
            {editButtonLabel}
          </button>
        ) : null}
        {onClear ? (
          <button
            type="button"
            data-testid={dataTestId ? `${dataTestId}-clear` : undefined}
            onClick={onClear}
            disabled={isBusy || !currentAsset}
            className="rounded-full border border-[#b13b45]/45 px-3 py-2 text-xs text-[#5f0f18] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {clearButtonLabel}
          </button>
        ) : null}
        <p className="text-[11px] text-white/42">
          {helperText ?? `原图会完整保留，仅按前台比例 ${preset.ratioLabel} 选择显示区域`}
        </p>
        <p className="text-[11px] text-white/38">支持拖拽图片，或先点此区域后按 Ctrl / Cmd + V 直接粘贴上传</p>
        {message ? (
          <p className="text-xs text-[#734d07]" role="status">
            {message}
          </p>
        ) : null}
      </div>

      {cropSession ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(244,248,255,0.82)] px-4 py-6 backdrop-blur-sm">
          <div className="surface w-full max-w-3xl rounded-[2rem] p-5 shadow-[0_24px_80px_rgba(24,33,47,0.18)] md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-accent)]">Crop Before Upload</p>
                <h3 className="text-2xl text-[var(--foreground)]">
                  按 {preset.cropTitle} 比例 {preset.ratioLabel} 取景
                </h3>
                <p className="max-w-2xl text-sm leading-7 ui-subtle">
                  {preset.cropHint} 拖动画面调整取景；原图不会被裁掉，之后可随时缩回。
                </p>
              </div>
              <button
                type="button"
                onClick={closeCropSession}
                disabled={isBusy}
                className="ui-button-secondary px-4 py-2 text-sm disabled:opacity-50"
              >
                取消
              </button>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="surface-strong rounded-[1.6rem] p-4">
                <div
                  ref={cropFrameRef}
                  data-testid={dataTestId ? `${dataTestId}-crop-frame` : undefined}
                  className="relative mx-auto w-full max-w-[25rem] overflow-hidden rounded-[1.35rem] border border-[var(--line-soft)] bg-white/80 touch-none"
                  style={{ aspectRatio: preset.aspectStyle }}
                  onPointerDown={handleCropPointerDown}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerEnd}
                  onPointerCancel={handleCropPointerEnd}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cropSession.imageUrl}
                    alt={cropSession.baseName}
                    draggable={false}
                    className="pointer-events-none absolute left-1/2 top-1/2 max-h-none max-w-none select-none object-cover"
                    style={{
                      width: cropSession.width * safeScale,
                      height: cropSession.height * safeScale,
                      transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                      willChange: "transform"
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 border border-[var(--line-soft)]" />
                  <div className="pointer-events-none absolute inset-0 grid grid-cols-3">
                    <span className="border-r border-[var(--line-soft)]" />
                    <span className="border-r border-[var(--line-soft)]" />
                    <span />
                  </div>
                  <div className="pointer-events-none absolute inset-0 grid grid-rows-3">
                    <span className="border-b border-[var(--line-soft)]" />
                    <span className="border-b border-[var(--line-soft)]" />
                    <span />
                  </div>
                </div>
              </div>

              <div className="surface-strong space-y-5 rounded-[1.6rem] p-5">
                <div>
                  <p className="text-sm text-white">比例</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {uploadPresets.map((ratioPreset) => {
                      const isActive = ratioPreset.ratioLabel === preset.ratioLabel;

                      return (
                        <button
                          key={ratioPreset.ratioLabel}
                          type="button"
                          data-testid={
                            dataTestId
                              ? `${dataTestId}-ratio-${ratioPreset.ratioLabel.replace(":", "-")}`
                              : undefined
                          }
                          onClick={() => setSelectedRatioLabel(ratioPreset.ratioLabel)}
                          disabled={isBusy}
                          className={`rounded-full border px-4 py-2 text-sm transition disabled:opacity-50 ${
                            isActive
                              ? "border-[var(--color-accent)] bg-[rgba(43,109,246,0.12)] text-[var(--foreground)]"
                              : "border-[var(--line-soft)] text-white/72 hover:border-[var(--color-accent)] hover:text-[var(--foreground)]"
                          }`}
                        >
                          {ratioPreset.ratioLabel}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs ui-subtle">支持 {supportedRatioText}，默认 {defaultPreset.ratioLabel}</p>
                </div>

                <div>
                  <p className="text-sm text-white">缩放</p>
                  <div className="mt-3 flex items-center gap-4">
                    <input
                      data-testid={dataTestId ? `${dataTestId}-crop-zoom` : undefined}
                      type="range"
                      min={0}
                      max={ZOOM_SLIDER_MAX}
                      step={1}
                      value={zoomSliderValue}
                      onChange={(event) => setScale(sliderValueToScale(Number(event.target.value), minScale, maxScale))}
                      className="w-full accent-[var(--color-accent)]"
                    />
                    <span className="w-14 text-right text-sm ui-subtle">
                      {Math.round((safeScale / minScale) * 100)}%
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 rounded-[1.2rem] border border-[var(--line-soft)] bg-white/80 p-4 text-sm ui-subtle">
                  <p>原图尺寸：{cropSession.width} × {cropSession.height}</p>
                  <p>显示比例：{preset.ratioLabel}</p>
                  <p>只保存显示区域，完整原图仍会保留。</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setOffset({ x: 0, y: 0 });
                      setScale(minScale);
                    }}
                    disabled={isBusy}
                    className="ui-button-secondary px-4 py-2 text-sm disabled:opacity-50"
                  >
                    重置取景
                  </button>
                  <button
                    type="button"
                    data-testid={dataTestId ? `${dataTestId}-confirm-crop` : undefined}
                    onClick={handleConfirmCrop}
                    disabled={isBusy || !cropBox}
                    className="rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm uppercase tracking-[0.2em] text-black disabled:opacity-50"
                  >
                    {pending ? "保存中..." : cropSession.existingAsset ? "保存显示区域" : "确认取景并上传"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
