export function LayoutShortcutBar() {
  return (
    <footer className="app-shortcut-bar" aria-label="단축키 안내">
      <span className="app-shortcut-bar__inner">
        <span className="app-shortcut-bar__label">접속 유저 패널</span>
        <span className="app-shortcut-bar__keys" aria-hidden>
          <kbd className="app-shortcut-bar__kbd">Ctrl</kbd>
          <span className="app-shortcut-bar__plus">+</span>
          <kbd className="app-shortcut-bar__kbd">Q</kbd>
        </span>
      </span>
    </footer>
  )
}
