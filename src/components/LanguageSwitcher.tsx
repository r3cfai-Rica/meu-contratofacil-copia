import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_LANGUAGE, normalizeLanguage } from "@/lib/i18n";

const LANGS = [
  { code: "pt-BR", flag: "🇧🇷", short: "PT", label: "Português (Brasil)" },
  { code: "en-US", flag: "🇺🇸", short: "EN", label: "English (US)" },
] as const;

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);

  useEffect(() => {
    setMounted(true);
    setLanguage(normalizeLanguage(i18n.resolvedLanguage ?? i18n.language));
  }, []);

  useEffect(() => {
    if (mounted) {
      setLanguage(normalizeLanguage(i18n.resolvedLanguage ?? i18n.language));
    }
  }, [i18n.language, i18n.resolvedLanguage, mounted]);

  if (!mounted) {
    return (
      <div
        className={className}
        style={{ display: "inline-flex", height: "2rem", width: "3.5rem" }}
        aria-hidden="true"
      />
    );
  }

  const current =
    LANGS.find((l) => l.code === language) ??
    (language.startsWith("en") ? LANGS[1] : LANGS[0]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={className}
          aria-label="Change language"
        >
          <span className="mr-1.5 text-base leading-none">{current.flag}</span>
          <span className="text-xs font-medium">{current.short}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => void i18n.changeLanguage(l.code)}
            className="gap-2"
          >
            <span className="text-base leading-none">{l.flag}</span>
            <span className="text-sm">{l.label}</span>
            {current.code === l.code && (
              <span className="ml-auto text-xs text-muted-foreground">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
