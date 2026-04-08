/**
 * 크롤링 HTML의 img·picture 등 미디어 URL을 공모전 원문 페이지 URL 기준으로 절대화합니다.
 * (상대 경로 / 프로토콜 상대 // 때문에 dangerouslySetInnerHTML에서 이미지가 깨지는 경우 방지)
 */
export function resolveHtmlMediaUrls(html: string, pageUrl: string): string {
  if (!html.trim() || !pageUrl.trim()) return html
  let base: URL
  try {
    base = new URL(pageUrl)
  } catch {
    return html
  }

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const resolve = (raw: string) => {
      const u = raw.trim()
      if (!u || u.startsWith('data:') || u.startsWith('blob:')) return u
      try {
        return new URL(u, base).href
      } catch {
        return u
      }
    }

    const resolveSrcset = (val: string) =>
      val
        .split(',')
        .map((part) => {
          const t = part.trim()
          const sp = t.search(/\s/)
          const urlPart = sp >= 0 ? t.slice(0, sp) : t
          const desc = sp >= 0 ? t.slice(sp) : ''
          if (!urlPart) return t
          return resolve(urlPart) + desc
        })
        .join(', ')

    doc.querySelectorAll('img').forEach((img) => {
      const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-original')
      const src = img.getAttribute('src')
      if (dataSrc && (!src || src.trim() === '' || /^data:/.test(src))) {
        img.setAttribute('src', resolve(dataSrc))
        return
      }
      if (src) img.setAttribute('src', resolve(src))
    })

    doc.querySelectorAll('img[srcset]').forEach((el) => {
      const v = el.getAttribute('srcset')
      if (v) el.setAttribute('srcset', resolveSrcset(v))
    })

    doc.querySelectorAll('source[srcset]').forEach((el) => {
      const v = el.getAttribute('srcset')
      if (v) el.setAttribute('srcset', resolveSrcset(v))
    })

    doc.querySelectorAll('source[src]').forEach((el) => {
      const v = el.getAttribute('src')
      if (v) el.setAttribute('src', resolve(v))
    })

    return doc.body.innerHTML
  } catch {
    return html
  }
}
