"use client";

import { useState } from "react";

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

const EMPTY: FormState = {
  institutionName: "",
  whyInterested: "",
  readerType: "",
  confusingPoint: "",
  email: "",
};

export default function RequestPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifySent, setNotifySent] = useState(false);

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.institutionName.trim()) return;

    // Build mailto body
    const body = [
      `[제도 제작 요청]`,
      ``,
      `제도명: ${form.institutionName}`,
      `왜 궁금한지: ${form.whyInterested}`,
      `독자 유형: ${form.readerType}`,
      `가장 헷갈리는 지점: ${form.confusingPoint}`,
      `이메일: ${form.email}`,
    ].join("\n");

    const subject = encodeURIComponent(
      `[제도100] 제작 요청 — ${form.institutionName}`
    );
    const encodedBody = encodeURIComponent(body);
    const mailtoUrl = `mailto:ghtjd10855@gmail.com?subject=${subject}&body=${encodedBody}`;

    // localStorage backup
    try {
      const saved = JSON.parse(
        localStorage.getItem("korea100_requests") ?? "[]"
      ) as FormState[];
      saved.push({ ...form, institutionName: form.institutionName });
      localStorage.setItem("korea100_requests", JSON.stringify(saved));
    } catch {
      // ignore
    }

    // Open mailto
    window.location.href = mailtoUrl;
    setSubmitted(true);
  }

  function handleNotify(e: React.FormEvent) {
    e.preventDefault();
    if (!notifyEmail.trim()) return;

    const subject = encodeURIComponent("[제도100] 출간 알림 신청");
    const body = encodeURIComponent(
      `출간 알림 신청 이메일: ${notifyEmail}\n\n한 장으로 끝내는 대한민국 제도 100 출간 시 알려주세요.`
    );
    window.location.href = `mailto:ghtjd10855@gmail.com?subject=${subject}&body=${body}`;

    try {
      localStorage.setItem("korea100_notify_email", notifyEmail);
    } catch {
      // ignore
    }

    setNotifySent(true);
  }

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
          책 목차 우선순위를 결정합니다. 이메일 클라이언트가 열리면 그대로 보내시면 됩니다.
        </p>
      </div>

      {/* Form */}
      {!submitted ? (
        <form onSubmit={handleSubmit} style={{ marginBottom: 64 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
                style={{
                  width: "100%",
                  padding: "13px 24px",
                  background: "var(--color-ink)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 140ms ease-out",
                  fontFamily: "inherit",
                }}
              >
                이메일 앱으로 요청 보내기 →
              </button>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--color-faint)",
                  marginTop: 8,
                  textAlign: "center",
                }}
              >
                이메일 앱이 열립니다. 브라우저에 임시 저장됩니다.
              </p>
            </div>
          </div>
        </form>
      ) : (
        <div
          style={{
            padding: "28px",
            background: "var(--color-accent-soft)",
            borderRadius: 12,
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
            요청이 전송되었습니다
          </h2>
          <p style={{ fontSize: 14, color: "var(--color-muted)", lineHeight: 1.7 }}>
            이메일 앱에서 보내기를 완료해 주세요. 브라우저에도 임시 저장되었습니다.
            다음 제도 제작 순서에 반영하겠습니다.
          </p>
          <button
            onClick={() => {
              setForm(EMPTY);
              setSubmitted(false);
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

        {!notifySent ? (
          <form onSubmit={handleNotify}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
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
                style={{
                  padding: "11px 20px",
                  background: "var(--color-accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  flexShrink: 0,
                  transition: "background 140ms ease-out",
                }}
              >
                알림 신청
              </button>
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--color-faint)",
                marginTop: 8,
              }}
            >
              이메일 앱이 열립니다. 직접 문의:{" "}
              <a
                href="mailto:ghtjd10855@gmail.com"
                style={{ color: "var(--color-accent-dark)" }}
              >
                ghtjd10855@gmail.com
              </a>
            </p>
          </form>
        ) : (
          <div
            style={{
              padding: "16px 20px",
              background: "var(--color-accent-soft)",
              borderRadius: 10,
              fontSize: 14,
              color: "var(--color-accent-dark)",
              fontWeight: 500,
            }}
          >
            이메일 앱에서 보내기를 완료해 주세요. 감사합니다.
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
  borderRadius: 10,
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color 140ms ease-out",
  boxSizing: "border-box",
};
