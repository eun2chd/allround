/**
 * 전역 로딩 오버레이 - 로그인, 페이지 이동, 데이터 로딩 시 사용
 * showLoading() / hideLoading() 으로 수동 제어 가능
 * 폼 제출, 내부 링크 클릭 시 자동 표시
 * 최적화: 빠른 페이지 전환 시 불필요한 로딩 오버레이 표시 방지
 */
(function () {
  const OVERLAY_ID = 'globalLoadingOverlay';
  const LOADING_DELAY_MS = 500; // 500ms(0.5초) 후에만 로딩 표시 (빠른 전환 시 생략)
  const FAST_NAVIGATION_THRESHOLD = 500; // 500ms 이내 완료 시 로딩 표시 안 함

  let loadingTimeout = null;
  let loadingStartTime = null;
  let pendingNavigation = false;

  function getOverlay() {
    return document.getElementById(OVERLAY_ID);
  }

  window.showLoading = function (immediate = false) {
    const el = getOverlay();
    if (!el) return;
    
    // 즉시 표시가 필요한 경우 (폼 제출 등)
    if (immediate) {
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
      }
      el.classList.add('is-active');
      loadingStartTime = Date.now();
      return;
    }
    
    // 지연 표시 (빠른 전환 시 생략)
    if (loadingTimeout) return; // 이미 대기 중
    loadingStartTime = Date.now();
    pendingNavigation = true;
    loadingTimeout = setTimeout(function() {
      if (pendingNavigation) {
        el.classList.add('is-active');
      }
      loadingTimeout = null;
    }, LOADING_DELAY_MS);
  };

  window.hideLoading = function () {
    const el = getOverlay();
    if (!el) return;
    
    // 로딩이 시작되기 전에 취소된 경우
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      loadingTimeout = null;
      pendingNavigation = false;
      return;
    }
    
    // 빠른 전환 완료 시 로딩 표시 안 함
    if (loadingStartTime && Date.now() - loadingStartTime < FAST_NAVIGATION_THRESHOLD) {
      el.classList.remove('is-active');
      pendingNavigation = false;
      loadingStartTime = null;
      return;
    }
    
    el.classList.remove('is-active');
    pendingNavigation = false;
    loadingStartTime = null;
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

    // 폼 제출 시 (로그인, 회원가입, 비밀번호 변경 등) - 즉시 표시
    // 버블 단계에서 실행되므로, 폼 쪽에서 preventDefault()한 경우(클라이언트 검증 실패 등)에는 표시하지 않음
    document.addEventListener('submit', function (e) {
      if (e.defaultPrevented) return;
      const form = e.target;
      if (form && form.tagName === 'FORM' && !form.hasAttribute('data-no-loading')) {
        showLoading(true); // 즉시 표시
      }
    });

    // 내부 링크 클릭 시 (마이페이지, 로그아웃, 회원가입 등) - 지연 표시
    document.addEventListener('click', function (e) {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!isInternalLink(href)) return;
      if (a.hasAttribute('target') && a.target === '_blank') return;
      if (a.hasAttribute('data-page')) return;
      if (a.hasAttribute('data-skip-loading')) return;
      showLoading(false); // 지연 표시
    });

    // 페이지 로드 완료 시 로딩 숨김
    window.addEventListener('load', function() {
      hideLoading();
    });

    // 페이지 전환 시작 시 로딩 표시 취소 (브라우저 네비게이션)
    window.addEventListener('beforeunload', function() {
      hideLoading();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoBind);
  } else {
    initAutoBind();
  }
})();
