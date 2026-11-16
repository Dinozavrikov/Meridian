// Вынесено из NotesTimeline — там были только внутри одного компонента,
// а теперь нужны и в рендере комментариев дискуссии.

export function getYouTubeId(url: string): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|(?:[a-z0-9-]+\.)?youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([A-Za-z0-9_-]{11})/i)
  return m ? m[1] : null
}

export function getVimeoId(url: string): string | null {
  if (!url) return null
  const m = url.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/[^\/]*\/videos\/|album\/(?:\d+)\/video\/|video\/|)(\d+)(?:$|\/|\?)/)
  return m ? m[1] : null
}

export function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(url.trim())
}
