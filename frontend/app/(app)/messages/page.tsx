// Список диалогов теперь рендерится в messages/layout.tsx (левая панель
// ResizableLayout). Этот файл — просто заглушка для голого "/messages" на
// мобиле, когда ничего не выбрано (на десктопе layout.tsx сам редиректит
// на первый диалог, сюда он не долетает).
export default function MessagesIndexPage() {
  return null
}
