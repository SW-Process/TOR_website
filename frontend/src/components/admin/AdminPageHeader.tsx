export default function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 px-5 sm:px-8 pt-8">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="mt-2 font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-extrabold leading-tight text-[var(--color-text)]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-lg text-sm text-[var(--color-ink-soft)] leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
