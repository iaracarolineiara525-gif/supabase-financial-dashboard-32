import logoGpn from "@/assets/logo-gpn.png";

export const GPNLogo = ({ className = "" }: { className?: string }) => {
  return (
    <img 
      src={logoGpn} 
      alt="GPN Digital" 
      className={`h-10 w-auto object-contain ${className}`}
    />
  );
};