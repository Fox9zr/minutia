import { Suspense } from "react";
import { CompanionAuthorizeClient } from "./companion-authorize-client";

export const metadata = { title: "Авторизовать companion" };

export default function CompanionAuthorizePage() {
  return (
    <Suspense>
      <CompanionAuthorizeClient />
    </Suspense>
  );
}
