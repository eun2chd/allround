# 참가 상세 문서 Storage (contest 버킷)

## 경로

| 항목 | 값 |
|------|------|
| 버킷명 | `contest` |
| 폴더 | `private` |
| 전체 경로 | `contest` > `private` |

### 상세 경로 구조

| 항목 | 예시 |
|------|------|
| 경로 패턴 | `private/{user_id}/doc_{source}_{contest_id}_{filename}` |
| 예시 | `private/330f87f4-8b69-4abc-a7e1-cfbae94c137f/doc_요즘것들_104759_제출물.pdf` |

- `private` 폴더 안에 `{user_id}` 폴더
- 각 유저 폴더에 `doc_{source}_{contest_id}_{파일명}` 형식으로 저장
- 버킷 Public 시 URL로 직접 접근, Private 시 RLS/SELECT 정책 필요

---

## Supabase 대시보드 설정

1. **Storage** → 버킷 `contest` 생성 (없으면)
2. `private` 폴더 생성 또는 업로드 시 자동 생성
3. Policies에서 본인 폴더(`private/{auth.uid()}/`) 업로드/조회 허용

### INSERT 정책 예시

- Policy name: `contest_insert_own_folder`
- Allowed operation: **INSERT**
- Target roles: `authenticated`
- Policy:
```
(bucket_id = 'contest')
AND ((storage.foldername(name))[1] = 'private')
AND ((storage.foldername(name))[2] = auth.uid()::text)
```

### SELECT 정책 (Private 버킷인 경우)

- Allowed operation: **SELECT**
- Policy:
```
(bucket_id = 'contest')
AND ((storage.foldername(name))[1] = 'private')
AND ((storage.foldername(name))[2] = auth.uid()::text)
```
