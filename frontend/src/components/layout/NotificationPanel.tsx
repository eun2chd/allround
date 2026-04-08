import { forwardRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  HiArrowPath,
  HiDocumentPlus,
  HiMegaphone,
  HiSparkles,
  HiXMark,
} from 'react-icons/hi2'
import { useConfirm } from '../../context/ConfirmContext'
import type { NotificationRow } from '../../services/notificationsService'
function NotiListIcon({ type }: { type: string | null }) {
  const cls = 'noti-type-ico'
  if (type === 'insert') return <HiDocumentPlus className={cls} aria-hidden />
  if (type === 'status') return <HiArrowPath className={cls} aria-hidden />
  if (type === 'notice') return <HiMegaphone className={cls} aria-hidden />
  if (type === 'tier') return <HiSparkles className={cls} aria-hidden />
  return <HiArrowPath className={cls} aria-hidden />
}

type Props = {
  open: boolean
  onClose: () => void
  items: NotificationRow[]
  onReadOne: (id: string | number) => Promise<boolean>
  onDeleteOne: (id: string | number) => Promise<boolean>
  onReadAll: () => Promise<boolean>
  onDeleteAll: () => Promise<boolean>
  onToast: (msg: string, type: 'success' | 'error') => void
}

function formatTimeAgo(isoStr: string | null): string {
  if (!isoStr) return ''
  const d = new Date(isoStr.includes('Z') || isoStr.includes('+') ? isoStr : isoStr + 'Z')
  if (Number.isNaN(d.getTime())) return ''
  const now = Date.now()
  const diff = Math.floor((now - d.getTime()) / 1000)
  if (diff < 60) return '방금 전'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}일 전`
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

export const NotificationPanel = forwardRef<HTMLElement, Props>(function NotificationPanel(
  { open, onClose, items, onReadOne, onDeleteOne, onReadAll, onDeleteAll, onToast }: Props,
  ref,
) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const readCount = items.filter((i) => i.read).length
  const unreadCount = items.filter((i) => !i.read).length
  const totalCount = items.length

  return (
    <aside ref={ref} className={'notification-panel' + (open ? ' open' : '')} aria-hidden={!open}>
      <div className="panel-header">
        <button type="button" className="panel-close" title="닫기" aria-label="닫기" onClick={onClose}>
          <HiXMark className="panel-close-ico" aria-hidden />
        </button>
        <div className="panel-title">알림목록</div>
        <div className="panel-stats">
          <span>
            읽음 <span className="count">{readCount}</span>건
          </span>
          <span>
            안읽음 <span className="count">{unreadCount}</span>건
          </span>
          <span>
            총 <span className="count">{totalCount}</span>건
          </span>
        </div>
        <div className="panel-actions">
          <button
            type="button"
            className="panel-action-btn"
            title="전체 읽음 처리"
            onClick={async () => {
              const ok = await onReadAll()
              if (ok) onToast('전체 읽음 처리하였습니다', 'success')
            }}
          >
            전체읽음
          </button>
          <button
            type="button"
            className="panel-action-btn delete-all"
            title="전체 삭제"
            onClick={async () => {
              const ok = await confirm({
                title: '알림 전체 삭제',
                message: '모든 알림을 삭제하시겠습니까?',
                confirmText: '삭제',
              })
              if (!ok) return
              const done = await onDeleteAll()
              if (done) onToast('전체 삭제하였습니다', 'success')
            }}
          >
            전체 삭제
          </button>
        </div>
      </div>
      <div className="panel-body">
        {items.length === 0 ? (
          <div className="empty-state">새 알림이 없습니다.</div>
        ) : (
          items.map((n) => (
            <div
              key={String(n.id)}
              className={'notification-item' + (!n.read ? ' unread' : '')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (n.type === 'notice') {
                    onClose()
                    navigate('/notices')
                  }
                }
              }}
              onClick={(ev) => {
                if ((ev.target as HTMLElement).closest('.noti-read-btn, .noti-delete-btn')) return
                if (n.type === 'notice') {
                  onClose()
                  navigate('/notices')
                }
              }}
            >
              <div className="noti-icon">
                <NotiListIcon type={n.type} />
              </div>
              <div className="noti-content">
                <div className="noti-title">{n.message || '알림'}</div>
                {formatTimeAgo(n.created_at) ? (
                  <div className="noti-time">{formatTimeAgo(n.created_at)}</div>
                ) : null}
              </div>
              <div className="noti-actions">
                <button
                  type="button"
                  className="noti-read-btn"
                  title="읽음"
                  disabled={n.read}
                  onClick={async (ev) => {
                    ev.stopPropagation()
                    if (n.read) return
                    const ok = await onReadOne(n.id)
                    if (ok) onToast('알림을 읽음 처리하였습니다', 'success')
                  }}
                >
                  읽음
                </button>
                <button
                  type="button"
                  className="noti-delete-btn"
                  title="삭제"
                  onClick={async (ev) => {
                    ev.stopPropagation()
                    const ok = await onDeleteOne(n.id)
                    if (ok) onToast('알림을 삭제하였습니다', 'success')
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  )
})
