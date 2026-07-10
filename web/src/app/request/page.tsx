"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/client-events";

const REQUEST_ENDPOINT =
  process.env.NEXT_PUBLIC_REQUEST_ENDPOINT?.trim() ?? "";
const PUBLIC_ISSUE_BASE =
  "https://github.com/hosungseo/korea100/issues/new?template=institution-request.yml";

const READER_TYPES = [
  "공무원·공공기관 직원",
  "국회·지방의회 보좌진",
  "정책연구자·컨설턴트",
  "기자·시민단체",
  "행정학·정책학 학생",
  "공시생",
  "로스쿨 학생",
  "일반 독자",
  "기타",
];

const CONFUSING_POINTS = [
  "어느 기관이 결정권을 갖는지",
  "법령 조문과 실제 절차의 차이",
  "예산·기금이 어디서 나오는지",
  "어떤 서류가 오가는지",
  "어디서 막히는지(병목)",
  "비슷한 제도들의 차이",
  "기타",
];

interface FormState {
  institutionName: string;
  whyInterested: string;
  readerType: string;
  confusingPoint: string;
  email: string;
}

type SubmissionStatus = "idle" | "submitting" | "success" | "error";

const EMPTY: FormState = {
  institutionName: "",
  whyInterested: "",
  readerType: "",
  confusingPoint: "",
  email: "",
};

export default function RequestPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [requestStatus, setRequestStatus] =
    useState<SubmissionStatus>("idle");
  const [requestMessage, setRequestMessage] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyStatus, setNotifyStatus] =
    useState<SubmissionStatus>("idle");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [company, setCompany] = useState("");

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.institutionName.trim()) return;
    if (company) {
      setRequestStatus("success");
      return;
    }

    saveDraft("korea100_request_draft", form);
    trackEvent("request_submit", {
      reader_type: form.readerType || "미선택",
      confusing_point: form.confusingPoint || "미선택",
      has_contact: Boolean(form.email),
    });

    if (!REQUEST_ENDPOINT) {
      setRequestStatus("error");
      setRequestMessage(
        "온라인 수집 주소가 아직 연결되지 않았습니다. 입력 내용은 이 브라우저에 임시 저장됐으며, 아래 대체 경로로 보낼 수 있습니다."
      );
      trackEvent("request_unavailable");
      return;
    }

    setRequestStatus("submitting");
    setRequestMessage("");
    try {
      await submitRequest("institution-request", form);
      localStorage.removeItem("korea100_request_draft");
      setRequestStatus("success");
      trackEvent("request_success");
    } catch {
      setRequestStatus("error");
      setRequestMessage(
        "요청을 저장하지 못했습니다. 입력 내용은 이 브라우저에 임시 저장됐습니다."
      );
      trackEvent("request_error");
    }
  }

  async function handleNotify(e: React.FormEvent) {
    e.preventDefault();
    if (!notifyEmail.trim()) return;
    saveDraft("korea100_notify_draft", { email: notifyEmail });
    trackEvent("publication_notify_submit");

    if (!REQUEST_ENDPOINT) {
      setNotifyStatus("error");
      setNotifyMessage(
        "온라인 알림 신청 주소가 아직 연결되지 않았습니다. 이메일 초안을 이용해 주세요."
      );
      return;
    }

    setNotifyStatus("submitting");
    setNotifyMessage("");
    try {
      await submitRequest("publication-notification", { email: notifyEmail });
      localStorage.removeItem("korea100_notify_draft");
      setNotifyStatus("success");
      trackEvent("publication_notify_success");
    } catch {
      setNotifyStatus("error");
      setNotifyMessage("알림 신청을 저장하지 못했습니다. 이메일 초안을 이용해 주세요.");
      trackEvent("publication_notify_error");
    }
  }

  const requestMailto = buildRequestMailto(form);
  const notifyMailto = buildNotifyMailto(notifyEmail);
  const publicIssueUrl = buildPublicIssueUrl(form);

  return (
    <div
      style={{
        maxWidth: 680,
        margin: "0 auto",
        padding: "56px 24px 80px",
      }}
    >
      {/* Title */}
      <div style={{ marginBottom: 40 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--color-faint)",
            marginBottom: 10,
          }}
        >
          독자 참여
        </div>
        <h1 className="request-page-title">
          다음 제도 제작 요청
        </h1>
        <p style={{ fontSize: 15, color: "var(--color-muted)", lineHeight: 1.7 }}>
          알고 싶은 제도를 알려주세요. 요청 데이터를 바탕으로 다음 제작 순서와
          책 목차 우선순위를 결정합니다. 제출이 완료된 경우에만 저장 완료 상태를 표시합니다.
        </p>
      </div>

      {/* Form */}
      {requestStatus !== "success" ? (
        <form onSubmit={handleSubmit} style={{ marginBottom: 64 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="request-honeypot" aria-hidden="true">
              <label htmlFor="company">회사</label>
              <input
                id="company"
                type="text"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>
            {/* 제도명 */}
            <FormField
              label="알고 싶은 제도명"
              htmlFor="institutionName"
              required
            >
              <input
                id="institutionName"
                type="text"
                placeholder="예: 예비타당성조사, 국민기초생활보장 등"
                value={form.institutionName}
                onChange={(e) => update("institutionName", e.target.value)}
                required
                style={inputStyle}
              />
            </FormField>

            {/* 왜 */}
            <FormField label="왜 궁금하신가요?" htmlFor="whyInterested">
              <textarea
                id="whyInterested"
                placeholder="어떤 상황에서, 어떤 정보가 필요하신지 간단히 적어주세요."
                value={form.whyInterested}
                onChange={(e) => update("whyInterested", e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </FormField>

            {/* 독자 유형 */}
            <FormField label="독자 유형" htmlFor="readerType">
              <select
                id="readerType"
                value={form.readerType}
                onChange={(e) => update("readerType", e.target.value)}
                style={inputStyle}
              >
                <option value="">선택 (선택사항)</option>
                {READER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </FormField>

            {/* 헷갈리는 지점 */}
            <FormField label="가장 헷갈리는 지점" htmlFor="confusingPoint">
              <select
                id="confusingPoint"
                value={form.confusingPoint}
                onChange={(e) => update("confusingPoint", e.target.value)}
                style={inputStyle}
              >
                <option value="">선택 (선택사항)</option>
                {CONFUSING_POINTS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>

            {/* 이메일 */}
            <FormField
              label="이메일 또는 연락처"
              htmlFor="email"
              hint="결과 공유나 후속 질문 시 연락드릴 수 있습니다."
            >
              <input
                id="email"
                type="email"
                placeholder="선택 입력"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                style={inputStyle}
              />
            </FormField>

            {/* Submit */}
            <div>
              <button
                type="submit"
                disabled={requestStatus === "submitting"}
                style={{
                  width: "100%",
                  padding: "13px 24px",
                  background: "var(--color-ink)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 140ms ease-out",
                  fontFamily: "inherit",
                }}
              >
                {requestStatus === "submitting" ? "저장 중..." : "제도 분석 제안 제출"}
              </button>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--color-faint)",
                  marginTop: 8,
                  textAlign: "center",
                }}
              >
                연락처는 선택사항이며 요청 처리와 결과 공유에만 사용합니다.
              </p>
            </div>

            {requestStatus === "error" && (
              <div className="request-feedback" role="alert">
                <p>{requestMessage}</p>
                <div>
                  <a href={requestMailto}>이메일 초안 열기</a>
                  <a href={publicIssueUrl} target="_blank" rel="noreferrer">
                    GitHub 공개 제안
                  </a>
                </div>
                <small>
                  GitHub 제안은 공개됩니다. 연락처나 사건번호 등 개인정보는 포함하지 마세요.
                </small>
              </div>
            )}
          </div>
        </form>
      ) : (
        <div
          style={{
            padding: "28px",
            background: "var(--color-accent-soft)",
            borderRadius: 8,
            border: "1px solid rgba(15,159,114,0.2)",
            marginBottom: 64,
          }}
        >
          <h2
            style={{
              fontSize: 20,
              fontWeight: 680,
              color: "var(--color-accent-dark)",
              marginBottom: 8,
            }}
          >
            요청이 저장되었습니다
          </h2>
          <p style={{ fontSize: 14, color: "var(--color-muted)", lineHeight: 1.7 }}>
            요청 수집함에 정상적으로 저장됐습니다. 다음 제도 제작 순서와 책 목차
            검토에 반영하겠습니다.
          </p>
          <button
            onClick={() => {
              setForm(EMPTY);
              setRequestStatus("idle");
              setRequestMessage("");
            }}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              background: "transparent",
              color: "var(--color-accent-dark)",
              border: "1px solid var(--color-accent)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            다른 제도 요청하기
          </button>
        </div>
      )}

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: "var(--color-border)",
          marginBottom: 48,
        }}
      />

      {/* Notify section */}
      <div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 680,
            color: "var(--color-ink)",
            marginBottom: 8,
          }}
        >
          출간 알림 신청
        </h2>
        <p style={{ fontSize: 15, color: "var(--color-muted)", lineHeight: 1.7, marginBottom: 24 }}>
          &ldquo;한 장으로 끝내는 대한민국 제도 100&rdquo; 책이 출간되면 알려드립니다.
          이메일을 남겨주세요.
        </p>

        {notifyStatus !== "success" ? (
          <form onSubmit={handleNotify}>
            <label
              htmlFor="publication-notification-email"
              style={{
                display: "block",
                marginBottom: 8,
                color: "var(--color-ink)",
                fontSize: 13,
                fontWeight: 650,
              }}
            >
              이메일 주소
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                id="publication-notification-email"
                type="email"
                placeholder="이메일 주소"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                required
                style={{
                  ...inputStyle,
                  flex: 1,
                  minWidth: 200,
                }}
              />
              <button
                type="submit"
                disabled={notifyStatus === "submitting"}
                style={{
                  padding: "11px 20px",
                  background: "var(--color-accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  flexShrink: 0,
                  transition: "background 140ms ease-out",
                }}
              >
                {notifyStatus === "submitting" ? "저장 중..." : "알림 신청"}
              </button>
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--color-faint)",
                marginTop: 8,
              }}
            >
              신청이 완료된 경우에만 저장 완료 상태를 표시합니다.
            </p>
            {notifyStatus === "error" && (
              <div className="request-feedback" role="alert">
                <p>{notifyMessage}</p>
                <div>
                  <a href={notifyMailto}>이메일 초안 열기</a>
                </div>
              </div>
            )}
          </form>
        ) : (
          <div
            style={{
              padding: "16px 20px",
              background: "var(--color-accent-soft)",
              borderRadius: 8,
              fontSize: 14,
              color: "var(--color-accent-dark)",
              fontWeight: 500,
            }}
          >
            출간 알림 신청이 저장되었습니다.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function FormField({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        style={{
          display: "block",
          fontSize: 14,
          fontWeight: 600,
          color: "var(--color-ink)",
          marginBottom: 6,
        }}
      >
        {label}
        {required && (
          <span style={{ color: "var(--color-accent)", marginLeft: 3 }}>*</span>
        )}
      </label>
      {hint && (
        <p
          style={{
            fontSize: 12,
            color: "var(--color-faint)",
            marginBottom: 6,
            lineHeight: 1.5,
          }}
        >
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  fontSize: 15,
  color: "var(--color-text)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 8,
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color 140ms ease-out",
  boxSizing: "border-box",
};

async function submitRequest(
  kind: "institution-request" | "publication-notification",
  data: FormState | { email: string }
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(REQUEST_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        kind,
        data,
        source: "korea100",
        submittedAt: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  } finally {
    window.clearTimeout(timeout);
  }
}

function saveDraft(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Draft storage is a convenience and must not block submission.
  }
}

function buildRequestMailto(form: FormState) {
  const subject = encodeURIComponent(
    `[제도100] 제작 요청 — ${form.institutionName || "제도 제안"}`
  );
  const body = encodeURIComponent(
    [
      "[제도 제작 요청]",
      "",
      `제도명: ${form.institutionName}`,
      `왜 궁금한지: ${form.whyInterested}`,
      `독자 유형: ${form.readerType}`,
      `가장 헷갈리는 지점: ${form.confusingPoint}`,
      `이메일: ${form.email}`,
    ].join("\n")
  );
  return `mailto:ghtjd10855@gmail.com?subject=${subject}&body=${body}`;
}

function buildNotifyMailto(email: string) {
  const subject = encodeURIComponent("[제도100] 출간 알림 신청");
  const body = encodeURIComponent(`출간 알림 신청 이메일: ${email}`);
  return `mailto:ghtjd10855@gmail.com?subject=${subject}&body=${body}`;
}

function buildPublicIssueUrl(form: FormState) {
  const title = encodeURIComponent(`[제도 제안] ${form.institutionName}`);
  const body = encodeURIComponent(
    [
      `## 제도명\n${form.institutionName}`,
      `## 알고 싶은 이유\n${form.whyInterested || "미작성"}`,
      `## 독자 유형\n${form.readerType || "미선택"}`,
      `## 가장 헷갈리는 지점\n${form.confusingPoint || "미선택"}`,
    ].join("\n\n")
  );
  return `${PUBLIC_ISSUE_BASE}&title=${title}&body=${body}`;
}
