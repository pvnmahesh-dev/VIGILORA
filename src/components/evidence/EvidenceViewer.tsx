"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Camera,
  AlertTriangle,
  Maximize2,
  X,
  Lock,
  ChevronLeft,
  ChevronRight,
  FileText,
  Clock,
  Layers,
  HardDrive,
  RefreshCw,
  FolderOpen,
} from "lucide-react";
import { EvidenceItem } from "@/types/evidence";

export interface EvidenceViewerProps {
  photoUrl?: string;
  photoUrls?: string[];
  evidenceList?: EvidenceItem[];
  incidentId?: string;
  incidentTitle?: string;
  incidentDate?: string;
  title?: string;
  alt?: string;
  className?: string;
  variant?: "standard" | "compact" | "thumbnail-only";
}

interface ResolvedMetadata {
  filename: string;
  mimeType: string;
  uploadedAt: string;
  fileSizeBytes?: number;
  uploadedByName?: string;
  origin: "s3-vault" | "demo-asset" | "external";
}

export function EvidenceViewer({
  photoUrl,
  photoUrls,
  evidenceList,
  incidentId,
  incidentTitle,
  incidentDate,
  title = "Incident photographic evidence",
  alt = "Photographic evidence",
  className = "",
  variant = "standard",
}: EvidenceViewerProps) {
  // 1. Normalize all incoming photo references into a uniform array
  const items: EvidenceItem[] = useMemo(() => {
    if (evidenceList && evidenceList.length > 0) {
      return evidenceList;
    }
    if (photoUrls && photoUrls.length > 0) {
      return photoUrls.map((url, idx) => ({
        url,
        incidentId,
        id: url.includes("/api/evidence/") ? url.split("/api/evidence/")[1]?.split("?")[0] : undefined,
        originalFilename: `evidence_photo_${idx + 1}.jpg`,
      }));
    }
    if (photoUrl) {
      return [
        {
          url: photoUrl,
          incidentId,
          id: photoUrl.includes("/api/evidence/")
            ? photoUrl.split("/api/evidence/")[1]?.split("?")[0]
            : undefined,
          originalFilename: "evidence_photo_1.jpg",
        },
      ];
    }
    return [];
  }, [evidenceList, photoUrls, photoUrl, incidentId]);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});
  const [metadataCache, setMetadataCache] = useState<Record<string, ResolvedMetadata>>({});

  const currentItem = items[currentIndex] || items[0] || null;

  // Derive initial / synchronous metadata
  const deriveFallbackMetadata = useCallback(
    (item: EvidenceItem | null): ResolvedMetadata => {
      if (!item) {
        return {
          filename: "unknown_evidence.bin",
          mimeType: "image/jpeg",
          uploadedAt: incidentDate || new Date().toISOString(),
          origin: "demo-asset",
        };
      }

      const url = item.url;
      const isS3Proxy = url.includes("/api/evidence/");
      let filename = item.originalFilename;

      if (!filename) {
        if (isS3Proxy) {
          const parts = url.split("/api/evidence/")[1]?.split("?")[0];
          filename = parts ? `evidence_${parts}.jpg` : "evidence_asset.jpg";
        } else {
          const cleanPath = url.split("?")[0];
          const lastSegment = cleanPath.substring(cleanPath.lastIndexOf("/") + 1);
          filename = lastSegment || "photograph.jpg";
        }
      }

      let mimeType = item.mimeType || "image/jpeg";
      if (!item.mimeType) {
        const lower = filename.toLowerCase();
        if (lower.endsWith(".png")) mimeType = "image/png";
        else if (lower.endsWith(".webp")) mimeType = "image/webp";
        else mimeType = "image/jpeg";
      }

      return {
        filename,
        mimeType,
        uploadedAt: item.uploadedAt || incidentDate || new Date().toISOString(),
        fileSizeBytes: item.fileSizeBytes,
        uploadedByName: item.uploadedByName || item.uploadedBy,
        origin: isS3Proxy ? "s3-vault" : "demo-asset",
      };
    },
    [incidentDate]
  );

  // Fetch genuine server metadata when an asset is an authenticated S3 proxy endpoint
  useEffect(() => {
    if (!currentItem || !currentItem.url) return;
    const url = currentItem.url;

    if (!url.includes("/api/evidence/")) {
      if (!metadataCache[url]) {
        setMetadataCache((prev) => ({
          ...prev,
          [url]: deriveFallbackMetadata(currentItem),
        }));
      }
      return;
    }

    if (metadataCache[url]) return;

    let isMounted = true;
    const metaUrl = url.includes("?") ? `${url}&metadata=true` : `${url}?metadata=true`;

    fetch(metaUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((payload) => {
        if (!isMounted) return;
        if (payload.success && payload.data) {
          const d = payload.data;
          setMetadataCache((prev) => ({
            ...prev,
            [url]: {
              filename: d.originalFilename || "evidence.jpg",
              mimeType: d.mimeType || "image/jpeg",
              uploadedAt: d.uploadedAt || incidentDate || new Date().toISOString(),
              fileSizeBytes: d.fileSizeBytes,
              uploadedByName: d.uploadedByName || d.uploadedBy,
              origin: "s3-vault",
            },
          }));
        } else {
          setMetadataCache((prev) => ({
            ...prev,
            [url]: deriveFallbackMetadata(currentItem),
          }));
        }
      })
      .catch(() => {
        if (isMounted) {
          setMetadataCache((prev) => ({
            ...prev,
            [url]: deriveFallbackMetadata(currentItem),
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentItem, metadataCache, deriveFallbackMetadata, incidentDate]);

  // Navigation handlers
  const handlePrev = useCallback(() => {
    if (items.length <= 1) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
  }, [items.length]);

  const handleNext = useCallback(() => {
    if (items.length <= 1) return;
    setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
  }, [items.length]);

  const handleCloseLightbox = useCallback(() => {
    setIsLightboxOpen(false);
  }, []);

  const openLightboxAt = useCallback((index: number) => {
    setCurrentIndex(index);
    setIsLightboxOpen(true);
  }, []);

  // Keyboard navigation & Escape key support
  useEffect(() => {
    if (!isLightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCloseLightbox();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLightboxOpen, handleCloseLightbox, handlePrev, handleNext]);

  // Image loading helpers
  const handleImageLoad = (url: string) => {
    setLoadingMap((prev) => ({ ...prev, [url]: false }));
    setErrorMap((prev) => {
      const copy = { ...prev };
      delete copy[url];
      return copy;
    });
  };

  const handleImageError = (url: string, errorMsg?: string) => {
    setLoadingMap((prev) => ({ ...prev, [url]: false }));
    setErrorMap((prev) => ({
      ...prev,
      [url]: errorMsg || "Evidence photograph could not be retrieved from secure enclave.",
    }));
  };

  const handleRetry = (url: string) => {
    setErrorMap((prev) => {
      const copy = { ...prev };
      delete copy[url];
      return copy;
    });
    setLoadingMap((prev) => ({ ...prev, [url]: true }));
  };

  if (items.length === 0) {
    return null;
  }

  const currentMetadata =
    (currentItem && metadataCache[currentItem.url]) || deriveFallbackMetadata(currentItem);

  const activeUrl = currentItem?.url || "";
  const isCurrentLoading = loadingMap[activeUrl] ?? true;
  const currentError = errorMap[activeUrl];

  // Helper formatting for file sizes
  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <>
      {/* ==================================================================== */}
      {/* IN-CONTEXT THUMBNAIL / PREVIEW COMPONENT                             */}
      {/* ==================================================================== */}
      <div
        className={`rounded-xl bg-[#050506] border border-[#87000A]/35 overflow-hidden shadow-lg ${
          variant === "compact" ? "p-2.5 space-y-2 text-xs" : "p-3 sm:p-4 space-y-3 text-xs"
        } ${className}`}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between text-xs font-oswald uppercase tracking-wider font-semibold text-[#E8E5E2]">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#F01420] shrink-0" />
            <span>
              {items.length > 1 ? `Photographic Evidence (${items.length})` : "Attached Evidence"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[#85858B] font-mono">
            <Lock className="w-3 h-3 text-[#87000A]" />
            <span>{currentMetadata.origin === "s3-vault" ? "S3 ENCLAVE" : "SECURE DISPATCH"}</span>
          </div>
        </div>

        {/* Thumbnail Preview Area */}
        <div className="relative rounded-lg overflow-hidden border border-[#87000A]/40 bg-black/60 flex items-center justify-center min-h-[130px] group">
          {currentError ? (
            <div className="p-4 text-center space-y-2 w-full">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#87000A]/20 border border-[#87000A]/50 text-[#F01420] mx-auto">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <p className="text-xs font-oswald uppercase tracking-wider font-semibold text-[#E8E5E2]">
                Evidence Photograph Unavailable
              </p>
              <p className="text-[10px] text-[#85858B] max-w-sm mx-auto line-clamp-2">
                {currentError}
              </p>
              <button
                type="button"
                onClick={() => handleRetry(activeUrl)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#080D13] hover:bg-[#87000A]/30 border border-[#87000A]/40 text-[10px] font-mono text-[#E8E5E2] transition-colors"
              >
                <RefreshCw className="w-3 h-3 text-[#F01420]" />
                <span>Retry Stream</span>
              </button>
            </div>
          ) : (
            <>
              {isCurrentLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#080D13]/90 text-xs font-mono text-[#85858B] gap-2 animate-pulse z-10">
                  <span className="w-2 h-2 rounded-full bg-[#F01420] animate-ping" />
                  <span>Streaming from secure proxy...</span>
                </div>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeUrl}
                alt={alt}
                onLoad={() => handleImageLoad(activeUrl)}
                onError={() =>
                  handleImageError(
                    activeUrl,
                    "Secure streaming proxy could not retrieve this asset, or session credentials lack sector authorization."
                  )
                }
                className={`w-full ${
                  variant === "compact" ? "max-h-36" : "max-h-56"
                } rounded-lg object-contain cursor-pointer transition-transform duration-300 group-hover:scale-[1.01]`}
                onClick={() => !isCurrentLoading && !currentError && openLightboxAt(currentIndex)}
              />

              {/* Inspect Fullscreen Overlay Button */}
              {!isCurrentLoading && !currentError && (
                <button
                  type="button"
                  onClick={() => openLightboxAt(currentIndex)}
                  className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/80 hover:bg-[#87000A] text-white border border-[#87000A]/50 shadow transition-colors opacity-90 group-hover:opacity-100 flex items-center gap-1 text-[10px] font-oswald uppercase tracking-wider"
                  title="Open Full Resolution Lightbox"
                >
                  <Maximize2 className="w-3 h-3 text-[#F01420]" />
                  <span>Inspect Lightbox</span>
                </button>
              )}

              {/* Multi-photo indicator pill */}
              {items.length > 1 && (
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/80 border border-[#87000A]/50 text-[10px] font-mono text-[#E8E5E2] flex items-center gap-1">
                  <Layers className="w-3 h-3 text-[#F01420]" />
                  <span>
                    {currentIndex + 1} / {items.length}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Multi-Photo Carousel Strip (if > 1 image) */}
        {items.length > 1 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[10px] font-oswald uppercase tracking-wider text-[#85858B]">
              <span>Attached Photographs</span>
              <span className="font-mono">
                {currentIndex + 1} of {items.length}
              </span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-[#87000A]/40">
              {items.map((item, idx) => {
                const isSelected = idx === currentIndex;
                const hasErr = Boolean(errorMap[item.url]);
                return (
                  <button
                    key={`${item.url}-${idx}`}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`relative shrink-0 w-14 h-14 rounded-lg overflow-hidden border transition-all ${
                      isSelected
                        ? "border-[#F01420] ring-1 ring-[#F01420] shadow-[0_0_10px_rgba(240,20,32,0.4)]"
                        : "border-[#87000A]/30 opacity-60 hover:opacity-100 hover:border-[#87000A]/70"
                    } bg-black/70 flex items-center justify-center`}
                  >
                    {hasErr ? (
                      <AlertTriangle className="w-4 h-4 text-[#F01420]" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.url}
                        alt={`Thumbnail ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={() =>
                          handleImageError(item.url, "Thumbnail unavailable in storage")
                        }
                      />
                    )}
                    <span className="absolute bottom-0 right-0 px-1 text-[8px] font-mono bg-black/80 text-white rounded-tl">
                      #{idx + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* POLISHED IN-CONTEXT MODAL LIGHTBOX                                   */}
      {/* ==================================================================== */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/92 backdrop-blur-md animate-in fade-in duration-200"
          onClick={handleCloseLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Incident photographic evidence lightbox"
        >
          <div
            className="relative max-w-5xl w-full max-h-[94dvh] flex flex-col rounded-2xl bg-[#080D13] border border-[#87000A]/60 shadow-[0_0_60px_rgba(135,0,10,0.4)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-[#87000A]/30 bg-[#050506]/80 shrink-0">
              <div className="space-y-0.5 min-w-0 pr-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#87000A]/20 border border-[#87000A]/50 text-[#F01420] font-mono text-[11px] font-bold uppercase tracking-wider">
                    <Lock className="w-3 h-3" />
                    <span>{incidentId ? `INCIDENT // ${incidentId}` : "SECURE EVIDENCE ENCLAVE"}</span>
                  </span>
                  {items.length > 1 && (
                    <span className="px-2 py-0.5 rounded bg-[#0c1219] border border-[#87000A]/30 font-mono text-[10px] text-[#E8E5E2]">
                      Photograph {currentIndex + 1} of {items.length}
                    </span>
                  )}
                </div>
                <h3 className="text-xs sm:text-sm font-oswald uppercase tracking-wider text-[#E8E5E2] font-semibold truncate mt-1">
                  {incidentTitle || title}
                </h3>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={handleCloseLightbox}
                className="p-1.5 rounded-lg bg-[#050506] hover:bg-[#87000A] text-[#85858B] hover:text-white border border-[#87000A]/40 transition-colors shrink-0"
                title="Close Lightbox (Esc)"
                aria-label="Close Lightbox"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Main Stage: Image and Carousel Navigation */}
            <div className="relative flex-1 min-h-[260px] sm:min-h-[380px] max-h-[62vh] sm:max-h-[68vh] bg-black/95 flex items-center justify-center p-2 sm:p-4 overflow-hidden select-none">
              {currentError ? (
                <div className="p-6 text-center space-y-3 max-w-md mx-auto">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#87000A]/25 border border-[#87000A]/60 text-[#F01420] mx-auto">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-oswald uppercase tracking-wider font-bold text-[#E8E5E2]">
                    Evidence Asset Inaccessible
                  </h4>
                  <p className="text-xs text-[#85858B] leading-relaxed">
                    {currentError}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleRetry(activeUrl)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#080D13] hover:bg-[#87000A]/40 border border-[#87000A]/50 text-xs font-mono text-white transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#F01420]" />
                    <span>Re-authenticate & Retry Stream</span>
                  </button>
                </div>
              ) : (
                <>
                  {isCurrentLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 text-xs font-mono text-[#85858B] gap-2 z-10 animate-pulse">
                      <span className="w-3 h-3 rounded-full bg-[#F01420] animate-ping" />
                      <span>Streaming binary payload from private enclave...</span>
                    </div>
                  )}

                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeUrl}
                    alt={alt}
                    onLoad={() => handleImageLoad(activeUrl)}
                    onError={() =>
                      handleImageError(
                        activeUrl,
                        "Evidence object not found or session lack authorization."
                      )
                    }
                    className="max-h-[58vh] sm:max-h-[64vh] w-auto max-w-full rounded-lg object-contain shadow-2xl transition-all duration-200"
                  />

                  {/* Previous Control (Left Arrow) */}
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={handlePrev}
                      className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2 sm:p-2.5 rounded-full bg-black/80 hover:bg-[#87000A] text-white border border-[#87000A]/60 shadow-lg transition-colors z-20 group"
                      title="Previous photograph [Left Arrow]"
                      aria-label="Previous photograph"
                    >
                      <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 group-hover:-translate-x-0.5 transition-transform" />
                    </button>
                  )}

                  {/* Next Control (Right Arrow) */}
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2 sm:p-2.5 rounded-full bg-black/80 hover:bg-[#87000A] text-white border border-[#87000A]/60 shadow-lg transition-colors z-20 group"
                      title="Next photograph [Right Arrow]"
                      aria-label="Next photograph"
                    >
                      <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Thumbnail Navigation Bar for multi-photo incidents */}
            {items.length > 1 && (
              <div className="bg-[#050506] px-3 py-2 border-t border-[#87000A]/20 flex items-center justify-center gap-2 overflow-x-auto shrink-0 scrollbar-thin">
                {items.map((item, idx) => {
                  const isSelected = idx === currentIndex;
                  return (
                    <button
                      key={`lightbox-thumb-${item.url}-${idx}`}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`relative w-12 h-12 rounded overflow-hidden border transition-all shrink-0 ${
                        isSelected
                          ? "border-[#F01420] ring-2 ring-[#F01420]/80 shadow"
                          : "border-[#87000A]/30 opacity-60 hover:opacity-100"
                      }`}
                      title={`Go to photograph ${idx + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.url}
                        alt={`Thumb ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-0 right-0 px-1 text-[8px] font-mono bg-black/80 text-white rounded-tl">
                        {idx + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Evidence Metadata Panel (Requirement 3: Filename, Upload timestamp, Content type, Incident association) */}
            <div className="bg-[#060A0E] border-t border-[#87000A]/30 p-3 sm:p-4 shrink-0 space-y-2.5">
              <div className="text-[10px] font-oswald uppercase tracking-widest text-[#F01420] font-bold flex items-center justify-between">
                <span>EVIDENCE ASSET METADATA</span>
                <span className="text-[#85858B] font-mono normal-case">
                  ESC to close • Arrows to navigate
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-xs">
                {/* 1. Filename */}
                <div className="p-2 rounded-lg bg-[#080D13] border border-[#87000A]/20 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-[#85858B] font-oswald uppercase tracking-wider">
                    <FileText className="w-3 h-3 text-[#F01420]" />
                    <span>Filename</span>
                  </div>
                  <div className="font-mono text-[11px] text-[#E8E5E2] truncate font-semibold" title={currentMetadata.filename}>
                    {currentMetadata.filename}
                  </div>
                </div>

                {/* 2. Upload Timestamp */}
                <div className="p-2 rounded-lg bg-[#080D13] border border-[#87000A]/20 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-[#85858B] font-oswald uppercase tracking-wider">
                    <Clock className="w-3 h-3 text-[#F01420]" />
                    <span>Upload Timestamp</span>
                  </div>
                  <div className="font-mono text-[11px] text-[#E8E5E2] truncate">
                    {currentMetadata.uploadedAt
                      ? new Date(currentMetadata.uploadedAt).toLocaleString([], {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : "Pending Sync"}
                  </div>
                </div>

                {/* 3. Content Type & Size */}
                <div className="p-2 rounded-lg bg-[#080D13] border border-[#87000A]/20 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-[#85858B] font-oswald uppercase tracking-wider">
                    <HardDrive className="w-3 h-3 text-[#F01420]" />
                    <span>Content Type & Size</span>
                  </div>
                  <div className="font-mono text-[11px] text-[#E8E5E2] truncate">
                    <span>{currentMetadata.mimeType}</span>
                    {formatBytes(currentMetadata.fileSizeBytes) && (
                      <span className="text-[#85858B]"> ({formatBytes(currentMetadata.fileSizeBytes)})</span>
                    )}
                  </div>
                </div>

                {/* 4. Incident Association */}
                <div className="p-2 rounded-lg bg-[#080D13] border border-[#87000A]/20 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-[#85858B] font-oswald uppercase tracking-wider">
                    <FolderOpen className="w-3 h-3 text-[#F01420]" />
                    <span>Incident Enclave</span>
                  </div>
                  <div className="font-mono text-[11px] text-[#F01420] font-bold truncate">
                    {incidentId || "DISPATCH-STREAM"}
                  </div>
                </div>
              </div>

              {/* Lightbox Footer Actions */}
              <div className="flex items-center justify-between pt-1 border-t border-[#87000A]/15 text-[10px] font-mono text-[#85858B]">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-[#87000A]" />
                  <span>
                    {currentMetadata.origin === "s3-vault"
                      ? "PROVENANCE: PRIVATE S3 VAULT // AUTHENTICATED STREAMING PROXY"
                      : "PROVENANCE: DEMONSTRATION DISPATCH RECORD"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleCloseLightbox}
                  className="px-2.5 py-1 rounded bg-[#050506] hover:bg-[#87000A] text-[#E8E5E2] hover:text-white border border-[#87000A]/40 font-oswald uppercase text-[10px] tracking-wider transition-colors"
                >
                  Dismiss Lightbox
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
