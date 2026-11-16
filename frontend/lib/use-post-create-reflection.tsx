"use client"
// Общая логика "плашки после создания записи" — теперь работает для
// любой сущности (prediction/observation/worldview), не только Прогнозов.
// Любое место, создающее сущность, вызывает show(entity) в onSuccess
// своей мутации и рендерит возвращённый modalNode рядом со своим JSX.
import { useState } from "react"
import { PostCreateReflectionModal, type PostCreateReflectionTarget } from "@/components/entities/post-create-reflection-modal"
import { ReflectionEntityType } from "@/lib/reflection-api"

export function usePostCreateReflection(entityType: ReflectionEntityType) {
  const [target, setTarget] = useState<PostCreateReflectionTarget | null>(null)
  const show = (entity: PostCreateReflectionTarget) => setTarget(entity)
  const modalNode = (
    <PostCreateReflectionModal entityType={entityType} target={target} onClose={() => setTarget(null)} />
  )
  return { show, modalNode }
}
