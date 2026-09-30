import { CreateClient } from "./CreateClient";

export const metadata = {
  title: "Kotrol Retro: ретроспектива, где поручения не забываются",
  description:
    "Бесплатная онлайн-доска ретроспективы для совместной работы. Проводите, выгружайте, без регистрации.",
};

export default function RetroCreatePage() {
  return <CreateClient />;
}
