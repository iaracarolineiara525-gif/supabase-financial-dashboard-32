import logoGpn from "@/assets/logo-gpn-new.webp";

export const GPNLogo = ({ className = "" }: { className?: string }) => {
  return (
    <img 
      src={logoGpn} 
      alt="GPN Digital" 
      className={`h-10 w-auto object-contain ${className}`}
    />
  );
};