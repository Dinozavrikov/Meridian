let seq = 0
/** Временный id оптимистичного сообщения: отрицательный (серверные id > 0) и уникальный в сессии, даже в одну миллисекунду. */
export function nextOptimisticId(): number { seq += 1; return -seq }
