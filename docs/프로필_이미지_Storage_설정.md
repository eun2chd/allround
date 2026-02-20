# 프로필 이미지 업로드 (Supabase Storage)

## 개요

마이페이지에서 프로필 이미지를 업로드하면 Supabase Storage `profile` 버킷에 저장되고, `profiles.profile_url`에 URL이 저장됩니다.

---

## Storage 경로

| 항목 | 값 |
|------|------|
| 버킷명 | `profile` |
| 경로 형식 | `private/{user_id}/avatar.{ext}` |
| 예시 | `private/550e8400-e29b-41d4-a716-446655440000/avatar.jpg` |

> **첫 번째 폴더가 `private`인 이유**: Storage RLS 정책에서 `(storage.foldername(name))[1] = 'private'` 조건을 요구합니다.

---

## RLS 정책 관련 (403 에러 해결)

### 문제

기존에 서버가 **service_role** 키로 Storage에 업로드하면 다음과 같은 에러가 발생했습니다:

```
{'statusCode': 403, 'error': 'Unauthorized', 'message': 'new row violates row-level security policy'}
```

Storage 정책이 `auth.role() = 'authenticated'`를 요구하는데, service_role로 요청하면 이 조건을 만족하지 못합니다.

### 해결 방법

**사용자 JWT(access_token)** 를 사용해 Supabase 클라이언트를 생성하고, 해당 클라이언트로 업로드합니다.

```
config.py: get_supabase_client_with_auth(access_token, refresh_token)
app.py: /api/profile/update-image 에서 session["access_token"]으로 클라이언트 생성 후 업로드/업데이트
```

로그인 시 세션에 저장된 `access_token`으로 요청하면 `auth.role() = 'authenticated'`를 만족하여 정책을 통과합니다.

---

## Storage 정책 예시

Supabase Dashboard → **Storage** → **profile** 버킷 → **Policies**에서 설정합니다.

### INSERT (업로드) 정책

```
(bucket_id = 'profile') 
AND ((storage.foldername(name))[1] = 'private') 
AND (auth.role() = 'authenticated')
```

본인 폴더에만 업로드하도록 제한하려면:

```
(bucket_id = 'profile') 
AND ((storage.foldername(name))[1] = 'private') 
AND ((storage.foldername(name))[2] = auth.uid()::text) 
AND (auth.role() = 'authenticated')
```

---

## 코드 흐름

1. 사용자가 마이페이지에서 이미지 선택 → `POST /api/profile/update-image`
2. 서버에서 `session["access_token"]`으로 `get_supabase_client_with_auth()` 클라이언트 생성
3. `private/{user_id}/avatar.{ext}` 경로로 Storage 업로드
4. `profiles` 테이블의 `profile_url` 업데이트
5. 세션의 `profile_url` 갱신 후 클라이언트에 반환

---

## 요약

| 질문 | 답변 |
|------|------|
| 업로드 경로? | `private/{user_id}/avatar.{ext}` |
| 왜 user JWT 사용? | Storage RLS가 `auth.role() = 'authenticated'` 요구 |
| service_role 쓰면? | 403 RLS 정책 위반 에러 발생 |
