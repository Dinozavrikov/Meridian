"use client"
import { askConfirmText } from "@/lib/confirm"
import { useState, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { imageApi, resolveMediaUrl } from "@/lib/api"
import { Lightbox } from "@/components/ui/image-attachment"
import { theme } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { ImagePlus, Trash2, Loader2, ImageOff } from "lucide-react"
import { apiErrorMessage } from "@/lib/api-error"

interface EntityImage {
  id: number
  entity_type: string
  entity_id: number
  url: string
  thumb_url: string
  width: number
  height: number
  size_bytes: number
  orig_size_bytes: number
  created_at: string
}

export function ImagesTab({ entityType, entityId, isOwner = true }: { entityType: string; entityId: number; isOwner?: boolean }) {
  const t = useT()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const { data, isLoading } = useQuery<EntityImage[]>({
    queryKey: ["entity-images", entityType, entityId],
    queryFn: () => imageApi.list(entityType, entityId),
  })

  const images = data ?? []

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => imageApi.upload(entityType, entityId, files),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entity-images", entityType, entityId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (imageId: number) => imageApi.delete(entityType, entityId, imageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entity-images", entityType, entityId] }),
  })

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    uploadMutation.mutate(Array.from(fileList))
  }

  return (
    <div style={{ padding: "16px 20px" }}>
      <style>{`@keyframes _imgspin{to{transform:rotate(360deg)}}`}</style>

      {isOwner && (
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          border: `1.5px dashed ${dragOver ? theme.accent ?? "#4A90D9" : "#242438"}`,
          borderRadius: 8, padding: "18px", cursor: "pointer",
          background: dragOver ? "rgba(74,144,217,0.06)" : "transparent",
          transition: "border-color 0.15s, background 0.15s",
          marginBottom: 16,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={e => { handleFiles(e.target.files); e.target.value = "" }}
        />
        {uploadMutation.isPending ? (
          <>
            <Loader2 size={16} style={{ animation: "_imgspin 0.8s linear infinite" }} color={theme.tx3} />
            <span style={{ fontSize: 12, color: theme.tx3 }}>{t("imagesTab.uploadingCompressing")}</span>
          </>
        ) : (
          <>
            <ImagePlus size={16} color={theme.tx3} />
            <span style={{ fontSize: 12, color: theme.tx3 }}>
              {t("imagesTab.dropHint")}
            </span>
          </>
        )}
      </div>

      )}

      {uploadMutation.isError && (
        <div style={{ fontSize: 12, color: "#E74C3C", marginBottom: 12 }}>
          {apiErrorMessage(uploadMutation.error, t("imagesTab.uploadError"), t("errors.invalidInput"))}
        </div>
      )}

      {isLoading ? (
        <div style={{ fontSize: 12, color: theme.tx3 }}>{t("imagesTab.loading")}</div>
      ) : images.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "24px 0", color: theme.tx3 }}>
          <ImageOff size={20} />
          <span style={{ fontSize: 12 }}>{t("imagesTab.empty")}</span>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
          {images.map((img, i) => (
            <div
              key={img.id}
              style={{ position: "relative", borderRadius: 6, overflow: "hidden", border: "1px solid #1E2236", aspectRatio: "1 / 1", cursor: "zoom-in", background: "#0b0d14" }}
              onClick={() => setLightboxIndex(i)}
            >
              <img
                src={resolveMediaUrl(img.thumb_url)!}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                loading="lazy"
              />
              <button
                onClick={async e => {
                  e.stopPropagation()
                  if (await askConfirmText(t("imagesTab.confirmDelete"))) deleteMutation.mutate(img.id)
                }}
                style={{
                  position: "absolute", top: 4, right: 4,
                  width: 22, height: 22, borderRadius: "50%",
                  background: "rgba(0,0,0,0.55)", border: "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", cursor: "pointer",
                }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {lightboxIndex !== null && images[lightboxIndex] && (
        <Lightbox
          src={resolveMediaUrl(images[lightboxIndex].url)!}
          onClose={() => setLightboxIndex(null)}
          caption={`${lightboxIndex + 1} / ${images.length}`}
          onPrev={images.length > 1 ? () => setLightboxIndex(i => (i! - 1 + images.length) % images.length) : undefined}
          onNext={images.length > 1 ? () => setLightboxIndex(i => (i! + 1) % images.length) : undefined}
        />
      )}
    </div>
  )
}


import { X as XIcon } from "lucide-react"

export function LocalImagePicker({ value, onChange }: {
  value: File[]
  onChange: (next: File[]) => void
}) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    onChange([...value, ...Array.from(fileList)])
  }
  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i))
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontSize: 12, color: "#9696a1", display: "flex", alignItems: "center", gap: 6 }}>
        <ImagePlus size={12} /> {t("imagesTab.pickerLabel")}
      </label>

      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {value.map((file, i) => {
            const url = URL.createObjectURL(file)
            return (
              <div key={i} style={{ position: "relative", width: 64, height: 64, borderRadius: 6, overflow: "hidden", border: "1px solid #1e1e2e" }}>
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  onLoad={e => URL.revokeObjectURL((e.target as HTMLImageElement).src)} />
                <button type="button" onClick={() => removeAt(i)}
                  style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>
                  <XIcon size={10} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          border: `1.5px dashed ${dragOver ? "#4A90D9" : "#1e1e2e"}`,
          borderRadius: 8, padding: "12px", cursor: "pointer",
          background: dragOver ? "rgba(74,144,217,0.06)" : "#0e0e16",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <input ref={inputRef} type="file" accept="image/*" multiple hidden
          onChange={e => { addFiles(e.target.files); e.target.value = "" }} />
        <ImagePlus size={14} color="#505060" />
        <span style={{ fontSize: 12, color: "#9696a1" }}>
          {t("imagesTab.pickerDropHint")}
        </span>
      </div>
    </div>
  )
}

export async function uploadImagesFor(entityType: string, entityId: number, files: File[]) {
  if (!files.length) return
  try {
    await imageApi.upload(entityType, entityId, files)
  } catch (e) {
    console.error("Не удалось загрузить изображения при создании сущности:", e)
  }
}
