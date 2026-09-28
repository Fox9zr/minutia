import { CreateClient } from "./CreateClient";

export const metadata = {
  title: "Minutia Retro, the retro where action items don't die",
  description:
    "Бесплатная онлайн-доска ретроспективы для совместной работы. Проводите, выгружайте, без регистрации.",
};

export default function RetroCreatePage() {
  return <CreateClient />;
}
