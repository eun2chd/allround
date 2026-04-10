-- 20260423 초안에서 트리거를 썼다가 제거한 경우 정리 (이미 없으면 무시)
DROP TRIGGER IF EXISTS contests_preserve_manual_entry ON public.contests;
DROP FUNCTION IF EXISTS public.contests_preserve_manual_entry();
