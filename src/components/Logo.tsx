type LogoProps = {
  className?: string;
};

export default function Logo({ className }: LogoProps) {
  return (
    <img
      src="/assets/logo-full.png"
      alt="Profit Pulse Ally"
      className={className}
    />
  );
}
