"use client";

import { useEffect, useState } from "react";

const CONTACT_EMAIL = "hosung.seo2026@gmail.com";
const LEGACY_DRAFT_KEYS = [
  "korea100_request_draft",
  "korea100_notify_draft",
];

const READER_TYPES = [
  "공무원·공공기관 직원",
  "국회·지방의회 보좌진",
  "정책연구자·컨설턴트",
  "기자·시민단체",
  "행정학·정책학 학생",
  "공시생",
  "로스쿨 학생",
  "일반 이용자",
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
}

const EMPTY: FormState = {
  institutionName: "",
  whyInterested: "",
  readerType: "",
  confusingPoint: "",
};

export default function RequestPage() {
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    try {
      LEGACY_DRAFT_KEYS.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // A blocked storage API should not affect the mail-only request flow.
    }
  }, []);

  function update(field: keyof FormState, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.institutionName.trim()) return;
    window.location.href = buildRequestMailto(form);
  }

  return (
    <div
      className="request-page"
      style={{
        maxWidth: 680,
        margin: "0 auto",
        padding: "56px 24px 80px",
      }}
    >
      <header style={{ marginBottom: 30 }}>
        <div
          style={{
            marginBottom: 10,
            color: "var(--color-faint)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
          }}
        >
          이용자 참여
        </div>
        <h1 className="request-page-title">다음 제도 제작 요청</h1>
        <p
          style={{
            color: "var(--color-muted)",
            fontSize: 15,
            lineHeight: 1.7,
          }}
        >
          알고 싶은 제도를 알려주세요. 작성한 내용으로 이메일 초안을 만들고,
          발송 여부는 사용자의 메일 앱에서 결정합니다.
        </p>
      </header>

      <div
        id="request-privacy-note"
        role="note"
        style={{
          marginBottom: 30,
          padding: "12px 14px",
          borderLeft: "3px solid var(--color-accent)",
          background: "var(--color-accent-soft)",
          color: "var(--color-accent-dark)",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        이 페이지는 입력 내용을 서버나 브라우저 저장소에 저장하지 않습니다.
        메일 앱을 연 뒤 발송하지 않으면 어떤 신청 정보도 전달되지 않습니다.
      </div>

      <form
        onSubmit={handleSubmit}
        autoComplete="off"
        aria-describedby="request-privacy-note"
        style={{ marginBottom: 52 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <FormField label="알고 싶은 제도명" htmlFor="institutionName" required>
            <input
              className="request-input"
              id="institutionName"
              name="institutionName"
              type="text"
              placeholder="예: 예비타당성조사, 국민기초생활보장 등"
              value={form.institutionName}
              onChange={(event) => update("institutionName", event.target.value)}
              maxLength={80}
              autoComplete="off"
              required
              style={inputStyle}
            />
          </FormField>

          <FormField label="왜 궁금하신가요?" htmlFor="whyInterested">
            <textarea
              className="request-input"
              id="whyInterested"
              name="whyInterested"
              placeholder="어떤 상황에서, 어떤 정보가 필요하신지 간단히 적어주세요."
              value={form.whyInterested}
              onChange={(event) => update("whyInterested", event.target.value)}
              maxLength={1000}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </FormField>

          <FormField label="이용자 유형" htmlFor="readerType">
            <select
              className="request-input"
              id="readerType"
              name="readerType"
              value={form.readerType}
              onChange={(event) => update("readerType", event.target.value)}
              style={inputStyle}
            >
              <option value="">선택 (선택사항)</option>
              {READER_TYPES.map((readerType) => (
                <option key={readerType} value={readerType}>
                  {readerType}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="가장 헷갈리는 지점" htmlFor="confusingPoint">
            <select
              className="request-input"
              id="confusingPoint"
              name="confusingPoint"
              value={form.confusingPoint}
              onChange={(event) => update("confusingPoint", event.target.value)}
              style={inputStyle}
            >
              <option value="">선택 (선택사항)</option>
              {CONFUSING_POINTS.map((point) => (
                <option key={point} value={point}>
                  {point}
                </option>
              ))}
            </select>
          </FormField>

          <div>
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "13px 24px",
                border: 0,
                borderRadius: 8,
                background: "var(--color-ink)",
                color: "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 15,
                fontWeight: 650,
                transition:
                  "background-color 140ms var(--ease-out), transform var(--duration-press) var(--ease-out)",
              }}
            >
              메일 앱에서 제안서 열기
            </button>
            <p
              style={{
                marginTop: 8,
                color: "var(--color-faint)",
                fontSize: 12,
                lineHeight: 1.5,
                textAlign: "center",
              }}
            >
              연락처를 입력받지 않으며 이 사이트는 제안 내용을 보관하지 않습니다.
            </p>
          </div>
        </div>
      </form>

      <div
        style={{
          height: 1,
          marginBottom: 38,
          background: "var(--color-border)",
        }}
      />

      <section aria-labelledby="request-direct-contact">
        <h2
          id="request-direct-contact"
          style={{
            marginBottom: 8,
            color: "var(--color-ink)",
            fontSize: 20,
            fontWeight: 680,
          }}
        >
          직접 문의
        </h2>
        <p
          style={{
            marginBottom: 10,
            color: "var(--color-muted)",
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          오류 제보나 제도 제작 요청은 이메일로 보내주세요. 사이트에서는
          문의자 정보를 수집하거나 보관하지 않습니다.
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          style={{
            color: "var(--color-accent-dark)",
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          {CONTACT_EMAIL}
        </a>
      </section>
    </div>
  );
}

function FormField({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        style={{
          display: "block",
          marginBottom: 6,
          color: "var(--color-ink)",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {label}
        {required && (
          <span style={{ marginLeft: 3, color: "var(--color-accent)" }}>*</span>
        )}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 14px",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 8,
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontFamily: "inherit",
  fontSize: 15,
  transition:
    "border-color 140ms var(--ease-out), box-shadow 140ms var(--ease-out)",
};

function buildRequestMailto(form: FormState) {
  const subject = encodeURIComponent(
    `[제도100] 제작 요청 — ${form.institutionName || "제도 제안"}`,
  );
  const body = encodeURIComponent(
    [
      "[제도 제작 요청]",
      "",
      `제도명: ${form.institutionName}`,
      `왜 궁금한지: ${form.whyInterested}`,
      `이용자 유형: ${form.readerType || "미선택"}`,
      `가장 헷갈리는 지점: ${form.confusingPoint || "미선택"}`,
    ].join("\n"),
  );
  return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
}
