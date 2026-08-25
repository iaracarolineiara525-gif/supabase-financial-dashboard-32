import logoGpn from "@/assets/logo-gpn-new.webp";

export const GPNLogo = ({ className = "" }: { className?: string }) => {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <span className="absolute -left-1 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_18px_hsl(var(--primary)/0.45)]" aria-hidden="true" />
      <img
        src={logoGpn}
        alt="GPN Digital"
        className="h-full w-auto object-contain grayscale contrast-125 brightness-110"
      />
    </div>
  );
};
