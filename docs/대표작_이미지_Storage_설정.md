# 대표작 이미지 Storage (rep 버킷)

## 경로

| 항목 | 값 |
|------|------|
| 버킷명 | `rep` |
| 폴더 구조 | `private/{user_id}/____{contest_id}.{ext}` |
| 예시 | `private/330f87f4-8b69-4abc-a7e1-cfbae94c137f/____104759.png` |

- `private` 폴더 안에 `{user_id}` 폴더, 그 안에 `____{contest_id}.png` 파일 저장
- 버킷은 Public으로 설정 (이미지 URL로 직접 접근)

---

## 403 RLS 에러 해결

업로드 시 `new row violates row-level security policy` 발생하면 Storage 정책을 추가하세요.

### 1. auth 클라이언트 사용 (코드)

서버에서 `access_token`으로 업로드하도록 이미 적용됨. (`_upload_rep_image`에서 `get_supabase_client_with_auth` 사용)

### 2. Supabase Storage 정책 추가

**Supabase Dashboard** → **Storage** → **rep** 버킷 → **Policies** → **New Policy**

**INSERT (업로드)**:
- Policy name: `rep_insert_own_folder`
- Allowed operation: **INSERT** (Upload)
- Target roles: `authenticated`
- Policy definition:
```
(bucket_id = 'rep') 
AND ((storage.foldername(name))[1] = 'private') 
AND ((storage.foldername(name))[2] = auth.uid()::text) 
AND (auth.role() = 'authenticated')
```

→ `private/{본인_user_id}/` 폴더에만 업로드 허용

**SELECT (조회, public URL)**  
버킷이 Public이면 별도 정책 없이 조회 가능. Private이면 SELECT 정책 추가 필요.
