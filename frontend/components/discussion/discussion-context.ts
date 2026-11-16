import { createContext } from "react"

/** Что комментарий обсуждения должен знать о записи, не получая это пропсами через Courtroom и CommentThread.
 *  inLab — запись принадлежит лаборатории: её комментарии попадают в снимки, и удаление этого не отменяет. */
export const DiscussionContext = createContext<{ inLab: boolean }>({ inLab: false })
