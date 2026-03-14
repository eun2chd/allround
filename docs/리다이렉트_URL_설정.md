# Supabase 리다이렉트 URL 설정 가이드

Supabase Authentication에서 허용해야 하는 모든 리다이렉트 URL 목록입니다.

---

## 📍 설정 위치

**Supabase Dashboard** → **Authentication** → **URL Configuration** → **Redirect URLs**

---

## ✅ 필수 리다이렉트 URL 목록

### 1. 비밀번호 재설정 (Password Reset)

비밀번호 재설정 이메일 링크에서 사용됩니다. (`app.py`의 `reset_password_for_email` 함수)

#### 로컬 개발 환경
```
http://localhost:5000/reset-password
http://127.0.0.1:5000/reset-password
```

#### 배포 환경 (예시)
```
https://yourdomain.com/reset-password
https://yourdomain.com/reset-password/
```

**참고**: URL 끝에 슬래시(`/`)가 있거나 없거나 모두 동작하도록 두 가지 모두 추가하는 것을 권장합니다.

---

### 2. 이메일 인증 (Email Confirmation)

회원가입 후 이메일 인증 링크에서 사용됩니다.

#### 로컬 개발 환경
```
http://localhost:5000
http://localhost:5000/
http://127.0.0.1:5000
http://127.0.0.1:5000/
```

#### 배포 환경 (예시)
```
https://yourdomain.com
https://yourdomain.com/
```

**참고**: 
- 이메일 인증 후 기본적으로 Site URL로 리다이렉트됩니다.
- 이메일 템플릿에서 커스텀 redirect URL을 설정한 경우 해당 URL도 추가해야 합니다.

---

### 3. Site URL 설정

**Authentication** → **URL Configuration** → **Site URL**

#### 로컬 개발 환경
```
http://localhost:5000
```

#### 배포 환경
```
https://yourdomain.com
```

**중요**: Site URL은 기본 리다이렉트 대상이므로 반드시 설정해야 합니다.

---

## 📋 전체 리다이렉트 URL 체크리스트

### 로컬 개발 환경 (localhost)

```
http://localhost:5000
http://localhost:5000/
http://localhost:5000/reset-password
http://localhost:5000/reset-password/
http://127.0.0.1:5000
http://127.0.0.1:5000/
http://127.0.0.1:5000/reset-password
http://127.0.0.1:5000/reset-password/
```

### 배포 환경 (프로덕션)

```
https://yourdomain.com
https://www.yourdomain.com
https://yourdomain.com/
https://www.yourdomain.com/
https://yourdomain.com/reset-password
https://www.yourdomain.com/reset-password
https://yourdomain.com/reset-password/
https://www.yourdomain.com/reset-password/
```

**실제 도메인으로 교체**: `yourdomain.com`을 실제 배포 도메인으로 변경하세요.

---

## 🔧 설정 방법

### Supabase Dashboard에서 설정

1. **Supabase Dashboard** 접속
2. **Authentication** → **URL Configuration** 메뉴 선택
3. **Redirect URLs** 섹션에서:
   - 각 URL을 한 줄씩 입력
   - **Add URL** 버튼 클릭하여 추가
4. **Site URL** 섹션에서 기본 도메인 설정
5. **Save** 버튼 클릭

### 와일드카드 사용 (선택사항)

Supabase는 와일드카드를 지원하지 않지만, 여러 환경을 지원하려면:

- 개발: `http://localhost:5000*`
- 스테이징: `https://staging.yourdomain.com*`
- 프로덕션: `https://yourdomain.com*`

**참고**: 와일드카드(`*`)는 Supabase에서 공식 지원하지 않을 수 있으므로, 필요한 URL을 모두 명시적으로 추가하는 것을 권장합니다.

---

## ⚠️ 주의사항

### 1. 프로토콜 일치
- `http://`와 `https://`는 다른 URL로 인식됩니다.
- 배포 환경에서는 반드시 `https://`를 사용하세요.

### 2. 포트 번호
- 로컬 개발 시 포트 번호가 다르면 해당 포트도 추가해야 합니다.
- 예: `http://localhost:8000/reset-password`

### 3. 서브도메인
- `yourdomain.com`과 `www.yourdomain.com`은 다른 도메인으로 인식됩니다.
- 둘 다 사용한다면 모두 추가해야 합니다.

### 4. 경로 끝 슬래시
- `/reset-password`와 `/reset-password/`는 다를 수 있습니다.
- 안전을 위해 둘 다 추가하는 것을 권장합니다.

### 5. 배포 플랫폼별 도메인
- Render: `https://your-app.onrender.com`
- Railway: `https://your-app.up.railway.app`
- Fly.io: `https://your-app.fly.dev`
- Vercel: `https://your-app.vercel.app`

배포 플랫폼에서 제공하는 도메인도 추가해야 합니다.

---

## 🧪 테스트 방법

### 1. 비밀번호 재설정 테스트

1. `/find-account` 페이지에서 이메일 입력
2. 이메일로 받은 비밀번호 재설정 링크 클릭
3. `/reset-password` 페이지로 정상 리다이렉트되는지 확인

**오류 발생 시**: "리다이렉트 URL이 허용되지 않음" 오류가 나면 Redirect URLs 목록을 확인하세요.

### 2. 이메일 인증 테스트

1. `/signup` 페이지에서 회원가입
2. 이메일로 받은 인증 링크 클릭
3. Site URL 또는 설정한 URL로 정상 리다이렉트되는지 확인

---

## 📝 코드에서의 리다이렉트 URL 사용

### 비밀번호 재설정 (`app.py`)

```python
redirect_url = request.url_root.rstrip("/") + url_for("reset_password_page")
supabase.auth.reset_password_for_email(email, {"redirect_to": redirect_url})
```

이 코드는 현재 요청의 루트 URL을 기반으로 동적으로 리다이렉트 URL을 생성합니다.

**예시**:
- 로컬: `http://localhost:5000/reset-password`
- 배포: `https://yourdomain.com/reset-password`

---

## 🔄 환경별 설정 예시

### 개발 환경
```
Site URL: http://localhost:5000
Redirect URLs:
  - http://localhost:5000
  - http://localhost:5000/
  - http://localhost:5000/reset-password
  - http://localhost:5000/reset-password/
```

### 스테이징 환경
```
Site URL: https://staging.yourdomain.com
Redirect URLs:
  - https://staging.yourdomain.com
  - https://staging.yourdomain.com/
  - https://staging.yourdomain.com/reset-password
  - https://staging.yourdomain.com/reset-password/
```

### 프로덕션 환경
```
Site URL: https://yourdomain.com
Redirect URLs:
  - https://yourdomain.com
  - https://www.yourdomain.com
  - https://yourdomain.com/
  - https://www.yourdomain.com/
  - https://yourdomain.com/reset-password
  - https://www.yourdomain.com/reset-password
  - https://yourdomain.com/reset-password/
  - https://www.yourdomain.com/reset-password/
```

---

## 📚 관련 문서

- [Supabase 공식 문서 - Redirect URLs](https://supabase.com/docs/guides/auth/auth-redirects)
- [배포 가이드](./배포가이드.md) - 배포 시 Supabase 설정 참고

---

## ✅ 체크리스트

배포 전 확인사항:

- [ ] 로컬 개발용 Redirect URLs 추가됨
- [ ] 배포 환경용 Redirect URLs 추가됨
- [ ] Site URL 설정됨
- [ ] 비밀번호 재설정 링크 테스트 완료
- [ ] 이메일 인증 링크 테스트 완료
- [ ] 모든 도메인 변형 추가됨 (www 포함)
- [ ] 프로토콜 일치 확인 (https)
- [ ] 경로 끝 슬래시 변형 추가됨
