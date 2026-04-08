"""
K-Startup 공공 API 수집 (엣지 `crawl-kstartup`와 동일 매핑)
ServiceKey는 URL 인코딩된 값 그대로 붙이지 말 것 (이중 인코딩 시 401).
"""

from __future__ import annotations

import logging
import re
from typing import Any

import requests

logger = logging.getLogger("allyoung.kstartup")

KSTARTUP_BASE = "https://apis.data.go.kr/B552735/kisedKstartupService01"
PER_PAGE = 10
SOURCE_KSTARTUP = "K-Startup"


def decode_xml_entities(s: str) -> str:
    if not s:
        return ""
    return (
        s.replace("&#xD;", "\r")
        .replace("&#xA;", "\n")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )


def parse_col_items(xml: str) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    item_re = re.compile(r"<item>([\s\S]*?)</item>")
    col_re = re.compile(r'<col\s+name="([^"]+)">([\s\S]*?)</col>')
    for m in item_re.finditer(xml):
        item_xml = m.group(1)
        row: dict[str, str] = {}
        for cm in col_re.finditer(item_xml):
            row[cm.group(1)] = decode_xml_entities(cm.group(2).strip())
        if row:
            items.append(row)
    return items


def parse_pagination(xml: str) -> dict[str, int]:
    def grab(pat: str, default: str) -> int:
        m = re.search(pat, xml)
        return int(m.group(1)) if m else int(default)

    return {
        "current_count": grab(r"<currentCount>(\d+)</currentCount>", "0"),
        "per_page": grab(r"<perPage>(\d+)</perPage>", "10"),
        "total_count": grab(r"<totalCount>(\d+)</totalCount>", "0"),
        "page": grab(r"<page>(\d+)</page>", "1"),
    }


def extract_id_from_url(url: str) -> str | None:
    if not url:
        return None
    decoded = url.replace("&amp;", "&").replace("&#38;", "&")
    m = re.search(r"[?&]id=(\d+)", decoded)
    if m:
        return m[1]
    m2 = re.search(r"id=(\d+)", decoded)
    return m2.group(1) if m2 else None


def fetch_api(api_name: str, service_key: str, page_no: int, num_of_rows: int) -> str:
    url = f"{KSTARTUP_BASE}/{api_name}?ServiceKey={service_key}&page={page_no}&numOfRows={num_of_rows}"
    logger.info("K-Startup API 요청 %s page=%s", api_name, page_no)
    res = requests.get(
        url,
        headers={"Accept": "application/xml, text/xml, */*"},
        timeout=60,
    )
    body = res.text
    if not res.ok:
        logger.error("K-Startup API 실패 %s HTTP %s %s", api_name, res.status, body[:500])
        raise RuntimeError(f"API {api_name} HTTP {res.status}")
    return body


def map_business_item(col: dict[str, str]) -> dict[str, Any] | None:
    detl_raw = col.get("detl_pg_url") or ""
    detl_pg_url = decode_xml_entities(detl_raw)
    id_from_url = extract_id_from_url(detl_pg_url)
    if not id_from_url:
        return None
    url = detl_pg_url.strip()
    if url and not url.startswith("http"):
        url = f"https://{url}"
    return {
        "id": id_from_url,
        "supt_biz_titl_nm": decode_xml_entities(col.get("supt_biz_titl_nm") or "") or None,
        "biz_category_cd": decode_xml_entities(col.get("biz_category_cd") or "") or None,
        "biz_yr": decode_xml_entities(col.get("biz_yr") or "") or None,
        "biz_supt_trgt_info": decode_xml_entities(col.get("biz_supt_trgt_info") or "") or None,
        "biz_supt_ctnt": decode_xml_entities(col.get("biz_supt_ctnt") or "") or None,
        "biz_supt_bdgt_info": decode_xml_entities(col.get("biz_supt_bdgt_info") or "") or None,
        "supt_biz_chrct": decode_xml_entities(col.get("supt_biz_chrct") or "") or None,
        "supt_biz_intrd_info": decode_xml_entities(col.get("supt_biz_intrd_info") or "") or None,
        "detl_pg_url": url or None,
    }


def map_announcement_item(col: dict[str, str]) -> dict[str, Any] | None:
    pbanc_sn = (col.get("pbanc_sn") or "").strip()
    if not pbanc_sn:
        return None
    return {
        "pbanc_sn": pbanc_sn,
        "biz_pbanc_nm": col.get("biz_pbanc_nm") or None,
        "intg_pbanc_biz_nm": col.get("intg_pbanc_biz_nm") or None,
        "pbanc_ntrp_nm": col.get("pbanc_ntrp_nm") or None,
        "biz_prch_dprt_nm": col.get("biz_prch_dprt_nm") or None,
        "prch_cnpl_no": col.get("prch_cnpl_no") or None,
        "supt_regin": col.get("supt_regin") or None,
        "supt_biz_clsfc": col.get("supt_biz_clsfc") or None,
        "sprv_inst": col.get("sprv_inst") or None,
        "pbanc_rcpt_bgng_dt": col.get("pbanc_rcpt_bgng_dt") or None,
        "pbanc_rcpt_end_dt": col.get("pbanc_rcpt_end_dt") or None,
        "rcrt_prgs_yn": col.get("rcrt_prgs_yn") or None,
        "intg_pbanc_yn": col.get("intg_pbanc_yn") or None,
        "pbanc_ctnt": col.get("pbanc_ctnt") or None,
        "aply_trgt": col.get("aply_trgt") or None,
        "aply_trgt_ctnt": col.get("aply_trgt_ctnt") or None,
        "aply_excl_trgt_ctnt": col.get("aply_excl_trgt_ctnt") or None,
        "biz_enyy": col.get("biz_enyy") or None,
        "biz_trgt_age": col.get("biz_trgt_age") or None,
        "detl_pg_url": col.get("detl_pg_url") or None,
        "biz_aply_url": col.get("biz_aply_url") or None,
        "biz_gdnc_url": col.get("biz_gdnc_url") or None,
        "aply_mthd_onli_rcpt_istc": col.get("aply_mthd_onli_rcpt_istc") or None,
        "aply_mthd_eml_rcpt_istc": col.get("aply_mthd_eml_rcpt_istc") or None,
        "aply_mthd_fax_rcpt_istc": col.get("aply_mthd_fax_rcpt_istc") or None,
        "aply_mthd_vst_rcpt_istc": col.get("aply_mthd_vst_rcpt_istc") or None,
        "aply_mthd_pssr_rcpt_istc": col.get("aply_mthd_pssr_rcpt_istc") or None,
        "aply_mthd_etc_istc": col.get("aply_mthd_etc_istc") or None,
        "prfn_matr": col.get("prfn_matr") or None,
    }


def fetch_business_page(service_key: str, page: int) -> tuple[list[dict[str, Any]], dict[str, int]]:
    xml = fetch_api("getBusinessInformation01", service_key, page, PER_PAGE)
    meta = parse_pagination(xml)
    if meta["current_count"] == 0:
        return [], meta
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for col in parse_col_items(xml):
        row = map_business_item(col)
        if row and row["id"] not in seen:
            seen.add(row["id"])
            rows.append(row)
    return rows, meta


def fetch_announcement_page(service_key: str, page: int) -> tuple[list[dict[str, Any]], dict[str, int]]:
    xml = fetch_api("getAnnouncementInformation01", service_key, page, PER_PAGE)
    meta = parse_pagination(xml)
    if meta["current_count"] == 0:
        return [], meta
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for col in parse_col_items(xml):
        row = map_announcement_item(col)
        if row and row["pbanc_sn"] not in seen:
            seen.add(row["pbanc_sn"])
            rows.append(row)
    return rows, meta


def probe_last_pages(service_key: str) -> tuple[int, int]:
    """첫 페이지 응답으로 통합지원사업·공고 각각 마지막 페이지 번호."""
    xml_b = fetch_api("getBusinessInformation01", service_key, 1, PER_PAGE)
    b = parse_pagination(xml_b)
    biz_last = max(1, (b["total_count"] + b["per_page"] - 1) // b["per_page"]) if b["total_count"] else 1

    xml_a = fetch_api("getAnnouncementInformation01", service_key, 1, PER_PAGE)
    a = parse_pagination(xml_a)
    ann_last = max(1, (a["total_count"] + a["per_page"] - 1) // a["per_page"]) if a["total_count"] else 1

    return biz_last, ann_last
