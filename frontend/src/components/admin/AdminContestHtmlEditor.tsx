import { useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { html } from '@codemirror/lang-html'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import { EditorView } from '@codemirror/view'
import { resolveHtmlMediaUrls } from '../../lib/resolveHtmlMediaUrls'

type Tab = 'edit' | 'preview'

type Props = {
  id: string
  value: string
  onChange: (next: string) => void
  /** 원문 URL — 미리보기·이미지 상대경로 보정에 사용 */
  pageUrl: string
}

export function AdminContestHtmlEditor({ id, value, onChange, pageUrl }: Props) {
  const [tab, setTab] = useState<Tab>('edit')

  const previewHtml = useMemo(() => {
    const raw = value.trim()
    if (!raw) return ''
    const u = pageUrl.trim()
    return u ? resolveHtmlMediaUrls(raw, u) : raw
  }, [value, pageUrl])

  const extensions = useMemo(
    () => [html(), vscodeDark, EditorView.lineWrapping],
    [],
  )

  return (
    <div className="admin-contests-html-editor">
      <div className="admin-contests-html-editor-tabs" role="tablist" aria-label="본문 편집 방식">
        <button
          type="button"
          role="tab"
          id={`${id}-tab-edit`}
          aria-selected={tab === 'edit'}
          aria-controls={`${id}-panel-edit`}
          className={'admin-contests-html-editor-tab' + (tab === 'edit' ? ' is-active' : '')}
          onClick={() => setTab('edit')}
        >
          편집
        </button>
        <button
          type="button"
          role="tab"
          id={`${id}-tab-preview`}
          aria-selected={tab === 'preview'}
          aria-controls={`${id}-panel-preview`}
          className={'admin-contests-html-editor-tab' + (tab === 'preview' ? ' is-active' : '')}
          onClick={() => setTab('preview')}
        >
          미리보기
        </button>
      </div>
      {tab === 'edit' ? (
        <div id={`${id}-panel-edit`} role="tabpanel" aria-labelledby={`${id}-tab-edit`} className="admin-contests-cm-host">
          <CodeMirror
            id={id}
            value={value}
            height="min(52vh, 440px)"
            theme="none"
            extensions={extensions}
            onChange={onChange}
            className="admin-contests-cm-root"
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              dropCursor: true,
              allowMultipleSelections: true,
            }}
            placeholder="HTML 본문을 입력하세요…"
          />
        </div>
      ) : (
        <div
          id={`${id}-panel-preview`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-preview`}
          className="admin-contests-html-editor-preview-outer"
        >
          {previewHtml ? (
            <div
              className="admin-contests-html-editor-preview"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : (
            <p className="admin-contests-html-editor-preview-empty-inner">편집 탭에서 HTML을 입력하면 여기서 렌더 결과를 확인할 수 있습니다.</p>
          )}
        </div>
      )}
    </div>
  )
}
