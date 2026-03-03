type FieldProps = {
  label?: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
};

export default function Field({ label, children, hint, required = false }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-zinc-800">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>

      {children}

      {hint ? <span className="text-[11px] text-zinc-500">{hint}</span> : null}
    </label>
  );
}
