# 팀 프로필 이미지 Storage (teamprofile 버킷)

## 경로

| 항목 | 값 |
|------|------|
| 버킷명 | `teamprofile` |
| 폴더 | `private` |
| 전체 경로 | `teamprofile` > `private` |

### 상세 경로 구조

| 항목 | 예시 |
|------|------|
| 경로 패턴 | `private/{year}_team.{ext}` |
| 예시 | `private/2025_team.png` |

- `private` 폴더 안에 `{year}_team.{ext}` 형식으로 저장
- 관리자만 업로드 (API에서 `_is_admin()` 체크 후 auth 클라이언트로 업로드)

---

## 403 RLS 에러 해결

업로드 시 `new row violates row-level security policy` 발생하면 Storage 정책을 추가하세요.

### 1. auth 클라이언트 사용 (코드)

서버에서 `access_token`으로 업로드하도록 적용됨. (대표작 이미지와 동일 방식, `get_supabase_client_with_auth` 사용)

### 2. Supabase Storage 정책 추가

**Supabase Dashboard** → **Storage** → **teamprofile** 버킷 → **Policies** → **New Policy**

**INSERT (업로드)**:
- Policy name: `teamprofile_insert_private`
- Allowed operation: **INSERT** (Upload)
- Target roles: `authenticated`
- Policy definition:
```
(bucket_id = 'teamprofile') 
AND ((storage.foldername(name))[1] = 'private') 
AND (auth.role() = 'authenticated')
```

→ `private/` 폴더에 업로드 허용 (API에서 관리자만 호출되므로 실질적으로 관리자 전용)

**SELECT (조회, public URL)**  
버킷이 Public이면 별도 정책 없이 조회 가능.
