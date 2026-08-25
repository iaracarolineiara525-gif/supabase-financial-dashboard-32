import logoGpn from "@/assets/logo-gpn-actual.png";

export const GPNLogo = ({ className = "" }: { className?: string }) => {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <img
        src={logoGpn}
        alt="GPN"
        className="h-full w-auto rounded-[22%] object-contain shadow-[0_0_24px_hsl(var(--primary)/0.24)] ring-1 ring-white/10"
      />
    </div>
  );
};
