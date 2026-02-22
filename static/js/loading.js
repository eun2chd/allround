/**
 * 전역 로딩 오버레이 - 로그인, 페이지 이동, 데이터 로딩 시 사용
 * showLoading() / hideLoading() 으로 수동 제어 가능
 * 폼 제출, 내부 링크 클릭 시 자동 표시
 */
(function () {
  const OVERLAY_ID = 'globalLoadingOverlay';

  function getOverlay() {
    return document.getElementById(OVERLAY_ID);
  }

  window.showLoading = function () {
    const el = getOverlay();
    if (el) el.classList.add('is-active');
  };

  window.hideLoading = function () {
    const el = getOverlay();
    if (el) el.classList.remove('is-active');
  };

  function isInternalLink(href) {
    if (!href || href === '#' || href.startsWith('javascript:')) return false;
    try {
      const url = new URL(href, window.location.origin);
      return url.origin === window.location.origin;
    } catch {
      return href.startsWith('/');
    }
  }

  function initAutoBind() {
    const overlay = getOverlay();
    if (!overlay) return;

    // 폼 제출 시 (로그인, 회원가입, 비밀번호 변경 등)
    document.addEventListener('submit', function (e) {
      const form = e.target;
      if (form && form.tagName === 'FORM' && !form.hasAttribute('data-no-loading')) {
        showLoading();
      }
    });

    // 내부 링크 클릭 시 (마이페이지, 로그아웃, 회원가입 등)
    document.addEventListener('click', function (e) {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!isInternalLink(href)) return;
      if (a.hasAttribute('target') && a.target === '_blank') return;
      if (a.hasAttribute('data-page')) return;
      showLoading();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoBind);
  } else {
    initAutoBind();
  }
})();
