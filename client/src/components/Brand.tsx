import { Video } from "lucide-react";

type BrandProps = {
  small?: boolean;
};

export function Brand({ small = false }: BrandProps) {
  return (
    <div className={`brand${small ? " small" : ""}`}>
      <div className="brand-icon">
        <Video size={small ? 18 : 22} />
      </div>
      <span>
        meet<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
