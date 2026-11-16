"use client"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Header } from "@/components/layout/header"
import { api as apiClient, taskApi, questionApi } from "@/lib/api"
import { FlaskConical, Plus, Users, Lock, Globe, X, Search } from "lucide-react"
import { v2, typeColor, tag, theme, entityCard, pageHeaderIcon, sectionLabel, detailTitle, sectionSearchWrap, sectionSearch } from "@/lib/theme"
import Link from "next/link"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { EditDeleteActions } from "@/components/layout/entity-row-actions"
import { EmptyState } from "@/components/dashboard/primitives"
import { useT } from "@/lib/i18n/useT"
import { labDeleteConfirmText } from "@/lib/lab-delete-confirm"
import { useMyLabs } from "@/lib/use-my-labs"
import { useListContentTranslation } from "@/lib/i18n/useContentT"
import { roleLabel } from "@/lib/lab-roles"
import { ruPluralForm } from "@/lib/i18n/ru-plural"

function LabCard({ lab, onDelete }: { lab: any; onDelete?: (id: number) => void }) {
  const t = useT()
  const [hov, setHov] = useState(false)
  const goalColor = lab.goal_type === "task" ? typeColor.task : typeColor.question
  const memberForm = ruPluralForm(lab.member_count)
  const memberKey = memberForm === "one" ? "labsPage.memberOne" : memberForm === "few" ? "labsPage.memberFew" : "labsPage.memberMany"
  return (
    <Link href={`/labs/${lab.slug || lab.id}`}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="block transition-colors group relative"
      style={{ ...entityCard(goalColor, hov), padding: "20px 22px" }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div style={{ ...pageHeaderIcon(goalColor), width: 32, height: 32 }}>
            <FlaskConical size={15} style={{ color: goalColor }} />
          </div>
          <h3 className="text-[14px] font-semibold truncate" style={{ color: v2.t1, letterSpacing: "-0.01em" }}>
            {lab.name}
          </h3>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1.5">
          {lab.is_public
            ? <Globe size={12} style={{ color: v2.t3 }} />
            : <Lock size={12} style={{ color: v2.t3 }} />}
          {onDelete && (
            <EditDeleteActions
              visible={hov}
              onDelete={() => onDelete(lab.id)}
              deleteConfirmText={labDeleteConfirmText(t, lab.name)}
            />
          )}
        </div>
      </div>
      {lab.description && <p className="text-[11.5px] line-clamp-2 mb-4" style={{ color: v2.t3, lineHeight: 1.6 }}>{lab.description}</p>}
      <span style={tag(goalColor)}>{lab.goal_type === "task" ? t("labsPage.goalTypeTask") : t("labsPage.goalTypeQuestion")}</span>
      <div className="text-[10.5px] mt-4" style={{ color: v2.t3, fontVariantNumeric: "tabular-nums" }}>
        {t(memberKey, { n: lab.member_count })}
        {lab.role && <> · {roleLabel(t, lab.role)}</>}
      </div>
    </Link>
  )
}

function GoalTypeButton({ active, color, onClick, children }: {
  active: boolean; color: string; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 text-center text-sm font-medium py-2.5 rounded-lg transition-all"
      style={{
        background: active ? `${color}18` : "transparent",
        color: active ? color : v2.t3,
        border: `1px solid ${active ? color + "40" : v2.bd}`,
      }}
    >
      {children}
    </button>
  )
}

function ToggleRow({ checked, onChange, color, title, subtitle }: {
  checked: boolean; onChange: () => void; color: string; title: string; subtitle?: string
}) {
  return (
    <div className="flex items-center gap-3 cursor-pointer" onClick={onChange}>
      <div className="w-9 h-5 rounded-full transition-colors relative shrink-0"
        style={{ background: checked ? color : v2.bd2 }}>
        <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all"
          style={{ left: checked ? 16 : 2 }} />
      </div>
      <div>
        <div className="text-sm" style={{ color: v2.t1 }}>{title}</div>
        {subtitle && <div className="text-[11px] mt-0.5" style={{ color: v2.t3 }}>{subtitle}</div>}
      </div>
    </div>
  )
}

function CreateLabModal({ onClose }: { onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [openJoin, setOpenJoin] = useState(false)
  const [goalType, setGoalType] = useState<"task" | "question">("task")
  const [goalMode, setGoalMode] = useState<"existing" | "new">("new")
  const [goalId, setGoalId] = useState<number | "">("")
  const [newGoalTitle, setNewGoalTitle] = useState("")

  const { data: myTasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: taskApi.list })
  const { data: myQuestions = [] } = useQuery({ queryKey: ["questions"], queryFn: () => questionApi.list() })
  const existingOptions = goalType === "task" ? myTasks : myQuestions
  const goalColor = goalType === "task" ? typeColor.task : typeColor.question

  const mut = useMutation({
    mutationFn: (data: any) => apiClient.post("/api/v1/labs", data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["labs"] }); onClose() },
  })

  const canSubmit = name.trim() && (goalMode === "existing" ? !!goalId : newGoalTitle.trim())

  const submit = () => {
    mut.mutate({
      name, description,
      is_public: isPublic,
      open_join: isPublic ? openJoin : false,
      goal_type: goalType,
      goal_id: goalMode === "existing" ? goalId : undefined,
      new_goal_title: goalMode === "new" ? newGoalTitle.trim() : undefined,
    })
  }

  return (
    <Modal open onClose={onClose} title={t("labsPage.createTitle")} size="md">
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-5">
          <Input label={t("field.name")} value={name} onChange={e => setName(e.target.value)}
            placeholder={t("labsPage.namePlaceholder")} />
          <Textarea label={t("scalesPage.description")} value={description} onChange={e => setDescription(e.target.value)}
            placeholder={t("labsPage.descriptionPlaceholder")} rows={2} />
        </div>

        <div className="pt-8" style={{ borderTop: `1px solid ${v2.bd}` }}>
          <div className="text-xs" style={{ color: v2.t3, marginBottom: 20 }}>{t("labsPage.goalSectionLabel")}</div>
          <div className="flex gap-3" style={{ marginBottom: 28 }}>
            <GoalTypeButton active={goalType === "task"} color={typeColor.task}
              onClick={() => { setGoalType("task"); setGoalId("") }}>{t("labsPage.goalTypeTask")}</GoalTypeButton>
            <GoalTypeButton active={goalType === "question"} color={typeColor.question}
              onClick={() => { setGoalType("question"); setGoalId("") }}>{t("labsPage.goalTypeQuestion")}</GoalTypeButton>
          </div>

          <div className="flex gap-6" style={{ marginBottom: 28 }}>
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: v2.t2 }}>
              <input type="radio" checked={goalMode === "new"} onChange={() => setGoalMode("new")}
                style={{ accentColor: goalColor }} />
              {t("labsPage.createNewOption")}
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: v2.t2 }}>
              <input type="radio" checked={goalMode === "existing"} onChange={() => setGoalMode("existing")}
                style={{ accentColor: goalColor }} />
              {t("labsPage.selectExistingOption")}
            </label>
          </div>

          {goalMode === "new" ? (
            <Input value={newGoalTitle} onChange={e => setNewGoalTitle(e.target.value)}
              placeholder={goalType === "task" ? t("labsPage.newTaskTitlePlaceholder") : t("labsPage.newQuestionTitlePlaceholder")} />
          ) : (
            <select value={goalId} onChange={e => setGoalId(e.target.value ? Number(e.target.value) : "")}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors"
              style={{ background: "#1c1c1c", border: `1px solid ${v2.bd2}`, color: v2.t1 }}>
              <option value="">{goalType === "task" ? t("labsPage.selectTaskPlaceholder") : t("labsPage.selectQuestionPlaceholder")}</option>
              {existingOptions.map((o: any) => (
                <option key={o.id} value={o.id}>{goalType === "task" ? o.name : o.title}</option>
              ))}
            </select>
          )}
        </div>

        <div className="pt-8 flex flex-col gap-5" style={{ borderTop: `1px solid ${v2.bd}` }}>
          <ToggleRow checked={isPublic} onChange={() => setIsPublic(p => !p)}
            color={theme.accent} title={t("labsPage.isPublicToggleTitle")} />
          {isPublic && (
            <div className="pl-4">
              <ToggleRow checked={openJoin} onChange={() => setOpenJoin(p => !p)}
                color={v2.teal} title={t("labsPage.openJoinToggleTitle")}
                subtitle={!openJoin ? t("labsPage.openJoinToggleSubtitle") : undefined} />
            </div>
          )}
        </div>

        {mut.error && <p className="text-xs" style={{ color: "#E74C3C" }}>{t("labsPage.createError")}</p>}

        <Button variant="primary" size="lg" disabled={!canSubmit || mut.isPending} onClick={submit} className="w-full">
          {mut.isPending ? t("labsPage.creatingButton") : t("labsPage.createButton")}
        </Button>
      </div>
    </Modal>
  )
}

export default function LabsPage() {
  const t = useT()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/v1/labs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labs"] })
      qc.invalidateQueries({ queryKey: ["labs", "public"] })
    },
  })

  const { data: myLabs = [], isLoading } = useMyLabs()
  const { data: rawPublicLabs = [] } = useQuery({
    queryKey: ["labs", "public"],
    queryFn: () => apiClient.get("/api/v1/labs/public").then(r => r.data),
  })
  // discover-лабы по определению исключают все мои (see myIds.has ниже) —
  // владелец здесь никогда не я, isOwnerFn всегда false, переводим без условий.
  const tPublicField = useListContentTranslation("lab", rawPublicLabs, ["name", "description"], () => false)
  const publicLabs = rawPublicLabs.map((lab: any) => ({
    ...lab,
    name: tPublicField(lab, "name", lab.name),
    description: tPublicField(lab, "description", lab.description),
  }))

  const [search, setSearch] = useState("")
  const myIds = new Set(myLabs.map((l: any) => l.id))
  const discover = publicLabs.filter((l: any) => !myIds.has(l.id))

  const q = search.trim().toLowerCase()
  const matches = (lab: any) =>
    !q || lab.name.toLowerCase().includes(q) || (lab.description ?? "").toLowerCase().includes(q)
  const myLabsFiltered = myLabs.filter(matches)
  const discoverFiltered = discover.filter(matches)

  return (
    <PageShell>
      <Header titleKey="page.labs.title" />
      <PageContent>
      {showCreate && <CreateLabModal onClose={() => setShowCreate(false)} />}
      <div className="p-8">

        <div style={{ ...sectionSearchWrap(), marginBottom: 32 }}>
          <Search size={12} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#9696a7", pointerEvents: "none" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("labsPage.searchPlaceholder")}
            style={sectionSearch(typeColor.lab)}
            onFocus={e => (e.target as HTMLInputElement).style.borderColor = `${typeColor.lab}40`}
            onBlur={e => (e.target as HTMLInputElement).style.borderColor = "#1e1e2a"}
          />
        </div>

        {/* мои лаборатории */}
        <div className="flex items-end justify-between" style={{ marginBottom: 40 }}>
          <div>
            <div className="flex items-baseline gap-3">
              <h2 style={detailTitle()}>{t("labsPage.myLabsHeading")}</h2>
              <span style={{ fontFamily: v2.fontSerif, fontStyle: "italic", fontWeight: 500, fontSize: 17, color: typeColor.lab }}>
                {myLabsFiltered.length}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg text-xs font-semibold transition-colors"
            style={{
              padding: "9px 16px",
              background: `${theme.accent}14`,
              color: theme.accent,
              border: `1px solid ${theme.accent}28`,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = `${theme.accent}22`
              ;(e.currentTarget as HTMLElement).style.borderColor = `${theme.accent}45`
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = `${theme.accent}14`
              ;(e.currentTarget as HTMLElement).style.borderColor = `${theme.accent}28`
            }}
          >
            <Plus size={14} /> {t("labsPage.createButton")}
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {[...Array(3)].map((_, i) => <div key={i} className="bg-[#1a1a1a] border border-[#242424] rounded-xl h-32 animate-pulse" />)}
          </div>
        ) : myLabsFiltered.length === 0 ? (
          <div className="mb-8 border border-dashed border-[#242424] rounded-xl">
            <EmptyState
              icon={<FlaskConical size={15} />}
              title={t("labsPage.emptyTitle")}
              body={t("labsPage.emptyBody")}
              actionLabel={t("labsPage.emptyAction")}
              onAction={() => setShowCreate(true)}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {myLabsFiltered.map((lab: any) => (
              <LabCard key={lab.id} lab={lab}
                onDelete={lab.role === "owner" ? (id: number) => deleteMut.mutate(id) : undefined} />
            ))}
          </div>
        )}

        {/* открытые лаборатории */}
        {discoverFiltered.length > 0 && (
          <>
            <div className="flex items-center gap-2" style={{ marginBottom: 40 }}>
              <Globe size={16} style={{ color: "#4A90D9" }} />
              <h2 className="text-sm font-semibold text-[#e0e0e0]">{t("labsPage.discoverHeading")}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {discoverFiltered.map((lab: any) => (
                <LabCard key={lab.id} lab={lab}
                  onDelete={lab.role === "owner" ? (id: number) => deleteMut.mutate(id) : undefined} />
              ))}
            </div>
          </>
        )}
      </div>
      </PageContent>
    </PageShell>
  )
}
