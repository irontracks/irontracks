type BrandMarkProps = {
  className?: string;
};

export default function BrandMark({ className }: BrandMarkProps) {
  return (
    <span className={className}>
      <span className="text-white">Macro</span>
      <span className="text-yellow-500">Mixer</span>
    </span>
  );
}
