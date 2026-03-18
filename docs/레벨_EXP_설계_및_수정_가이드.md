# 레벨/EXP 설계 및 수정 가이드

레벨업이 너무 쉽다고 느껴질 때, **테이블을 수정해야 하는지** vs **하드코딩된 값을 수정해야 하는지** 정리한 문서입니다.

---

## 1. 요약 표

| 구분 | 저장 위치 | 수정 방법 | 비고 |
|------|-----------|-----------|------|
| **액션별 지급 EXP** (내용확인 5, 참가 15 등) | **하드코딩** (app.py) | `app.py` 내 `EXP_AMOUNTS` 수정 | 레벨업 속도에 직결 |
| **레벨당 필요 EXP** (L1→2에 25, L21→22에 40 등) | **DB 테이블** `level_config` | Supabase에서 `level_config` 데이터 수정 또는 마이그레이션 SQL 실행 | 레벨업 난이도 조절 |
| **티어 구간** (L1~20=BRONZE, L21~70=SILVER 등) | **하드코딩** (app.py) + **DB** `level_tiers` | 레벨→티어 계산은 `app.py`의 `_get_tier_from_level()` 사용 | 구간 변경 시 함수와 테이블 모두 고려 |
| **경험치 지급 기록** | **DB 테이블** `exp_events` | 지급 **금액**은 코드에서 읽어서 저장하므로, 테이블 스키마 수정 불필요 | 이미 쌓인 EXP 조정이 필요하면 별도 보정 로직 필요 |

---

## 2. 액션별 지급 EXP (하드코딩)

**파일**: `app.py`  
**위치**: `EXP_AMOUNTS` 딕셔너리 (약 524~531행)

```python
EXP_AMOUNTS = {
    "content_check": 5,      # 내용확인
    "participate": 15,       # 참가
    "pass": 5,               # 패스
    "support_complete": 20,  # 지원완료 (참가상세 제출)
    "finalist": 300,         # 본선진출
    "award": 1000,           # 수상
}
```

- **역할**: 공모전 관련 행위 시 사용자에게 지급하는 EXP 양.
- **수정 시**: 위 숫자만 바꾸면 됨. (예: 내용확인 5→2, 참가 15→8)
- **저장**: 지급할 때마다 `EXP_AMOUNTS[activity_type]` 값을 읽어 `exp_events`에 `exp_amount`로 insert 하고, `profiles.total_exp`를 증가시킴.
- **테이블**: `exp_events`는 “기록”만 저장. 지급량은 항상 코드 값 사용 → **테이블 구조/데이터 수정 없이 코드만 수정하면 됨.**

---

## 3. 레벨당 필요 EXP (DB 테이블)

**테이블**: `level_config`  
**스키마**: `level` (PK), `exp_to_next`, `tier_id`

- **역할**: “현재 레벨에서 다음 레벨로 올라가려면 몇 EXP가 필요한지” 정의.
- **사용처**: `app.py`의 `_compute_level_from_exp()`, `_compute_level_exp()` 등에서 **매번 DB를 조회**해서 레벨/진행률 계산.
- **수정 방법**  
  - **옵션 A**: Supabase SQL Editor에서 `level_config`의 `exp_to_next` 값을 직접 UPDATE.  
  - **옵션 B**: `docs/db_schema.md`에 있는 `level_config` 시드/INSERT SQL을 수정한 뒤, 새 마이그레이션 파일을 만들어 적용하거나, Supabase에서 해당 SQL 실행.

**현재 설계 예시 (db_schema.md 기준)**:

| 구간 | 레벨 | exp_to_next (레벨당) |
|------|------|----------------------|
| BRONZE | 1~20 | 25 |
| SILVER | 21~70 | 40 |
| GOLD | 71~120 | 60 |
| PLATINUM | 121~140 | 100 |
| LEGEND | 141~200 | 150 |

레벨업을 더 느리게 하려면:

- `level_config`의 `exp_to_next`를 구간별로 **늘리면** 됨. (예: BRONZE 25→50, SILVER 40→80)
- 시드 SQL에서 `INSERT ... exp_to_next` 값을 바꾼 뒤, 기존 데이터를 덮어쓰는 방식으로 적용하면 됨.

---

## 4. 티어 구간 (하드코딩 + DB)

**레벨 → 티어 계산**: `app.py`의 `_get_tier_from_level(level)` (약 510~520행)

```python
def _get_tier_from_level(level):
    if level <= 20:   return 1, "BRONZE", 0
    if level <= 70:   return 2, "SILVER", 1
    if level <= 120:  return 3, "GOLD", 2
    if level <= 140:  return 4, "PLATINUM", 3
    return 5, "LEGEND", 4
```

- **역할**: 현재 레벨이 어느 티어인지, 티어 이름/인덱스 반환.
- **수정 시**: 티어 구간을 바꾸려면 위 함수의 레벨 기준(20, 70, 120, 140)을 수정해야 함.
- **DB**: `level_tiers` 테이블에 티어 메타(level_min, level_max, exp_per_level 등)가 있지만, **실제 레벨→티어 판단은 위 함수만 사용**하고 있음. UI/문서와 맞추려면 `level_tiers` 데이터도 같이 맞추는 것이 좋음.

---

## 5. exp_events 테이블

- **역할**: (user_id, activity_type, source, contest_id)당 **한 번만** 지급되도록 중복 방지 + 지급 이력 저장.
- **지급량**: 매 요청 시 `EXP_AMOUNTS[activity_type]`으로 계산해 insert. **테이블에 “기본값”을 두지 않음.**
- **수정**: 레벨업 난이도 조절을 위해 **테이블 스키마를 수정할 필요 없음**.  
  - 이미 쌓인 EXP를 줄이거나 늘리려면, `profiles.total_exp` 보정 + (선택) `exp_events` 행 수정/삭제 등 **별도 보정 로직**이 필요함.

---

## 6. 레벨업을 더 느리게 하려면 (실전 체크리스트)

1. **지급 EXP 줄이기**  
   - `app.py`의 `EXP_AMOUNTS`에서 `content_check`, `participate`, `pass`, `support_complete` 등 값을 **낮추기**.

2. **레벨당 필요 EXP 늘리기**  
   - DB `level_config`의 `exp_to_next`를 **늘리기** (또는 db_schema.md의 시드 SQL 수정 후 반영).

3. **둘 다 적용**  
   - 지급은 줄이고, 필요 EXP는 늘리면 레벨업이 가장 느려짐.

4. **티어 구간 변경**  
   - 필요 시 `app.py`의 `_get_tier_from_level()`과 `level_tiers` 테이블 데이터를 함께 수정.

---

## 7. 참고: 관련 파일·테이블

| 대상 | 파일 / 테이블 |
|------|----------------|
| 액션별 지급 EXP | `app.py` → `EXP_AMOUNTS`, `EXP_ACTIVITY_LABELS` |
| 지급 처리 | `app.py` → `_grant_exp()` |
| 레벨/진행률 계산 | `app.py` → `_compute_level_from_exp()`, `_compute_level_exp()` |
| 티어 판단 | `app.py` → `_get_tier_from_level()` |
| 레벨당 필요 EXP | DB `level_config` |
| 티어 메타 | DB `level_tiers` |
| 경험치 이벤트 기록 | DB `exp_events` |
| 스키마/시드 문서 | `docs/db_schema.md` (level_config, level_tiers, exp_events) |

위 문서와 표를 기준으로, “테이블을 고칠지 / 코드를 고칠지”만 정리해 두었습니다. 실제 수치 변경 시에는 이 가이드의 해당 섹션만 따라가면 됩니다.
