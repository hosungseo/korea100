import { Suspense } from "react";
import { getInstitutionSummaries, getCategoryOrder } from "@/lib/data";
import RegistryCatalog from "@/components/RegistryCatalog";

export default function HomePage() {
  const institutions = getInstitutionSummaries();
  const categoryOrder = getCategoryOrder();

  return (
    <Suspense fallback={<CatalogFallback />}>
      <RegistryCatalog
        institutions={institutions}
        categoryOrder={categoryOrder}
      />
    </Suspense>
  );
}

function CatalogFallback() {
  return (
    <section aria-label="제도 대장 불러오는 중">
      <div className="explorer-loading">
        제도 카탈로그를 불러오는 중입니다.
      </div>
    </section>
  );
}
